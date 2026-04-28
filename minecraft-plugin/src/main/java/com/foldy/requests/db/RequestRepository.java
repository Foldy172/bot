package com.foldy.requests.db;

import com.foldy.requests.model.RequestRecord;
import com.foldy.requests.model.RequestStatus;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class RequestRepository {
    private final DatabaseManager db;

    public RequestRepository(DatabaseManager db) {
        this.db = db;
    }

    public void upsert(RequestRecord request) throws SQLException {
        String sql = db.isMySql()
                ? """
                INSERT INTO requests (id, player_name, edition, status, is_admin, created_by_discord_id, created_by_discord_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    player_name = VALUES(player_name),
                    edition = VALUES(edition),
                    status = VALUES(status),
                    is_admin = VALUES(is_admin),
                    created_by_discord_id = VALUES(created_by_discord_id),
                    created_by_discord_name = VALUES(created_by_discord_name),
                    updated_at = VALUES(updated_at)
                """
                : """
                INSERT INTO requests (id, player_name, edition, status, is_admin, created_by_discord_id, created_by_discord_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    player_name = excluded.player_name,
                    edition = excluded.edition,
                    status = excluded.status,
                    is_admin = excluded.is_admin,
                    created_by_discord_id = excluded.created_by_discord_id,
                    created_by_discord_name = excluded.created_by_discord_name,
                    updated_at = excluded.updated_at
                """;
        try (Connection c = db.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, request.id());
            ps.setString(2, request.playerName());
            ps.setString(3, request.edition());
            ps.setString(4, request.status().name());
            ps.setBoolean(5, request.admin());
            ps.setString(6, request.createdByDiscordId());
            ps.setString(7, request.createdByDiscordName());
            ps.setLong(8, request.createdAt().toEpochMilli());
            ps.setLong(9, request.updatedAt().toEpochMilli());
            ps.executeUpdate();
        }
    }

    public void updateStatus(String id, RequestStatus status) throws SQLException {
        String sql = "UPDATE requests SET status = ?, updated_at = ? WHERE id = ?";
        try (Connection c = db.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, status.name());
            ps.setLong(2, Instant.now().toEpochMilli());
            ps.setString(3, id);
            ps.executeUpdate();
        }
    }

    public Optional<RequestRecord> findById(String id) throws SQLException {
        String sql = "SELECT * FROM requests WHERE id = ?";
        try (Connection c = db.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(map(rs));
            }
        }
    }

    public List<RequestRecord> findAll() throws SQLException {
        String sql = "SELECT * FROM requests ORDER BY updated_at DESC";
        List<RequestRecord> out = new ArrayList<>();
        try (Connection c = db.getConnection(); PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                out.add(map(rs));
            }
        }
        return out;
    }

    private RequestRecord map(ResultSet rs) throws SQLException {
        return new RequestRecord(
                rs.getString("id"),
                rs.getString("player_name"),
                rs.getString("edition"),
                RequestStatus.fromString(rs.getString("status")),
                rs.getBoolean("is_admin"),
                rs.getString("created_by_discord_id"),
                rs.getString("created_by_discord_name"),
                Instant.ofEpochMilli(rs.getLong("created_at")),
                Instant.ofEpochMilli(rs.getLong("updated_at"))
        );
    }
}

