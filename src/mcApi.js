const RETRIES = 3;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class McApiClient {
  constructor(baseUrl, secret) {
    this.baseUrl = baseUrl;
    this.secret = secret;
  }

  async whitelistRemove(playerName) {
    return this.#withRetry(async () => {
      const res = await fetch(`${this.baseUrl}/api/whitelist/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.secret
        },
        body: JSON.stringify({ playerName })
      });
      if (!res.ok) {
        throw new Error(`whitelistRemove failed: ${res.status}`);
      }
    });
  }

  async createOrSyncRequest(payload) {
    return this.#withRetry(async () => {
      const res = await fetch(`${this.baseUrl}/api/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.secret
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error(`createOrSyncRequest failed: ${res.status}`);
      }
    });
  }

  async updateStatus(id, status) {
    return this.#withRetry(async () => {
      const res = await fetch(`${this.baseUrl}/api/requests/${id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.secret
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        throw new Error(`updateStatus failed: ${res.status}`);
      }
    });
  }

  async #withRetry(fn) {
    let lastError;
    for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < RETRIES) {
          await sleep(attempt * 1000);
        }
      }
    }
    throw lastError;
  }
}

