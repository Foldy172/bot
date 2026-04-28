package com.foldy.requests.config;

import org.bukkit.configuration.file.FileConfiguration;

public record PluginConfig(
        String apiHost,
        int apiPort,
        String apiSecret,
        boolean whitelistOnAccept,
        String databaseType,
        String sqliteFile,
        String mysqlHost,
        int mysqlPort,
        String mysqlDatabase,
        String mysqlUser,
        String mysqlPassword,
        int mysqlPoolSize
) {
    public static PluginConfig fromBukkit(FileConfiguration cfg) {
        return new PluginConfig(
                cfg.getString("api.host", "0.0.0.0"),
                cfg.getInt("api.port", 8085),
                cfg.getString("api.secret-key", "change-me"),
                cfg.getBoolean("requests.whitelist-on-accept", true),
                cfg.getString("database.type", "sqlite"),
                cfg.getString("database.sqlite.file", "requests.db"),
                cfg.getString("database.mysql.host", "127.0.0.1"),
                cfg.getInt("database.mysql.port", 3306),
                cfg.getString("database.mysql.database", "mc_requests"),
                cfg.getString("database.mysql.user", "root"),
                cfg.getString("database.mysql.password", ""),
                cfg.getInt("database.mysql.pool-size", 10)
        );
    }
}

