import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class RequestStore {
  constructor(path) {
    this.path = path;
    this.data = { requests: [], blacklist: [] };
    this._persistQueue = Promise.resolve();
  }

  async load() {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      const raw = await readFile(this.path, "utf-8");
      const parsed = JSON.parse(raw);
      this.data = {
        requests: Array.isArray(parsed?.requests) ? parsed.requests : [],
        blacklist: Array.isArray(parsed?.blacklist) ? parsed.blacklist : []
      };
      await this.pruneExpiredBlacklist();
    } catch {
      await this.persist();
    }
  }

  async persist() {
    // Queue writes to avoid JSON corruption on concurrent persists.
    this._persistQueue = this._persistQueue.then(() =>
      writeFile(this.path, JSON.stringify(this.data, null, 2), "utf-8")
    );
    await this._persistQueue;
  }

  async pruneExpiredBlacklist() {
    const now = Date.now();
    const before = this.data.blacklist.length;
    this.data.blacklist = this.data.blacklist.filter((entry) => {
      if (typeof entry === "string") {
        return true; // legacy permanent entry
      }
      if (!entry || typeof entry !== "object") {
        return false;
      }
      if (!entry.discordUserId) {
        return false;
      }
      if (!entry.expiresAt) {
        return true; // permanent entry
      }
      const ts = Date.parse(entry.expiresAt);
      if (Number.isNaN(ts)) {
        return true; // treat invalid date as permanent rather than deleting
      }
      return ts > now;
    });
    if (this.data.blacklist.length !== before) {
      await this.persist();
    }
  }

  getById(id) {
    return this.data.requests.find((r) => r.id === id);
  }

  async create(request) {
    this.data.requests.push(request);
    await this.persist();
  }

  async update(id, patch) {
    const current = this.getById(id);
    if (!current) {
      return null;
    }
    Object.assign(current, patch);
    await this.persist();
    return current;
  }

  async isBlacklisted(discordUserId) {
    await this.pruneExpiredBlacklist();
    return this.data.blacklist.some((entry) =>
      typeof entry === "string" ? entry === discordUserId : entry.discordUserId === discordUserId
    );
  }

  listBlacklist() {
    return [...this.data.blacklist];
  }

  async addToBlacklist(discordUserId, { minutes = null, reason = null, addedBy = null } = {}) {
    await this.pruneExpiredBlacklist();

    // If already exists, replace with new entry (to update expiry/reason)
    this.data.blacklist = this.data.blacklist.filter((entry) =>
      typeof entry === "string" ? entry !== discordUserId : entry.discordUserId !== discordUserId
    );

    const expiresAt =
      typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
        ? new Date(Date.now() + minutes * 60_000).toISOString()
        : null;

    const entry =
      expiresAt || reason || addedBy
        ? {
            discordUserId,
            expiresAt,
            reason: reason || null,
            addedBy: addedBy || null,
            addedAt: new Date().toISOString()
          }
        : discordUserId; // legacy/permanent compact entry

    this.data.blacklist.push(entry);
    await this.persist();
    return this.listBlacklist();
  }

  async removeFromBlacklist(discordUserId) {
    const before = this.data.blacklist.length;
    this.data.blacklist = this.data.blacklist.filter((entry) =>
      typeof entry === "string" ? entry !== discordUserId : entry.discordUserId !== discordUserId
    );
    if (this.data.blacklist.length !== before) {
      await this.persist();
    }
    return this.listBlacklist();
  }
}

