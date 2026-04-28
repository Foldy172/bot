package com.foldy.requests.model;

import java.time.Instant;

public record RequestRecord(
        String id,
        String playerName,
        String edition,
        RequestStatus status,
        boolean admin,
        String createdByDiscordId,
        String createdByDiscordName,
        Instant createdAt,
        Instant updatedAt
) {
}

