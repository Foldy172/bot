import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class RequestStore {
  constructor(path) {
    this.path = path;
    this.data = { requests: [] };
  }

  async load() {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      const raw = await readFile(this.path, "utf-8");
      this.data = JSON.parse(raw);
    } catch {
      await this.persist();
    }
  }

  async persist() {
    await writeFile(this.path, JSON.stringify(this.data, null, 2), "utf-8");
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
}

