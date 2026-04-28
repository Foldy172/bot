package com.foldy.requests.db;

import com.foldy.requests.config.PluginConfig;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;

public class DatabaseManager {
    private final JavaPlugin plugin;
    private final PluginConfig config;
    private boolean mySql;
    private HikariDataSource dataSource;

    public DatabaseManager(JavaPlugin plugin, PluginConfig config) {
        this.plugin = plugin;
        this.config = config;
    }

    public void connect() {
        HikariConfig hikariConfig = new HikariConfig();
        String type = config.databaseType().toLowerCase(Locale.ROOT);
        mySql = "mysql".equals(type);
        if (mySql) {
            ensureMySqlDatabaseExists();
            hikariConfig.setJdbcUrl("jdbc:mysql://" + config.mysqlHost() + ":" + config.mysqlPort() + "/" + config.mysqlDatabase());
            hikariConfig.setUsername(config.mysqlUser());
            hikariConfig.setPassword(config.mysqlPassword());
            hikariConfig.setMaximumPoolSize(config.mysqlPoolSize());
        } else {
            ensureSqlitePathExists();
            File dbFile = new File(plugin.getDataFolder(), config.sqliteFile());
            hikariConfig.setJdbcUrl("jdbc:sqlite:" + dbFile.getAbsolutePath());
            hikariConfig.setMaximumPoolSize(1);
        }
        hikariConfig.setPoolName("mc-requests-pool");
        hikariConfig.setConnectionTimeout(10000);
        hikariConfig.setValidationTimeout(5000);
        hikariConfig.setInitializationFailTimeout(-1);
        dataSource = new HikariDataSource(hikariConfig);
        createSchema();
    }

    private void ensureSqlitePathExists() {
        if (!plugin.getDataFolder().exists() && !plugin.getDataFolder().mkdirs()) {
            throw new IllegalStateException("Failed to create plugin data folder: " + plugin.getDataFolder().getAbsolutePath());
        }
        File dbFile = new File(plugin.getDataFolder(), config.sqliteFile());
        File parent = dbFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Failed to create SQLite directory: " + parent.getAbsolutePath());
        }
    }

    private void ensureMySqlDatabaseExists() {
        String adminUrl = "jdbc:mysql://" + config.mysqlHost() + ":" + config.mysqlPort() + "/";
        String sql = "CREATE DATABASE IF NOT EXISTS `" + config.mysqlDatabase() + "`";
        try (Connection c = DriverManager.getConnection(adminUrl, config.mysqlUser(), config.mysqlPassword());
             Statement s = c.createStatement()) {
            s.execute(sql);
        } catch (SQLException e) {
            throw new IllegalStateException("Failed to create MySQL database: " + config.mysqlDatabase(), e);
        }
    }

    private void createSchema() {
        String ddl = """
                CREATE TABLE IF NOT EXISTS requests (
                    id VARCHAR(64) PRIMARY KEY,
                    player_name VARCHAR(16) NOT NULL,
                    edition VARCHAR(16) NOT NULL,
                    status VARCHAR(16) NOT NULL,
                    is_admin BOOLEAN NOT NULL,
                    created_by_discord_id VARCHAR(32),
                    created_by_discord_name VARCHAR(64),
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL
                )
                """;
        try (Connection c = getConnection(); Statement s = c.createStatement()) {
            s.execute(ddl);
            migrateColumnsIfNeeded(s);
        } catch (SQLException e) {
            throw new IllegalStateException("Failed to initialize DB schema", e);
        }
    }

    private void migrateColumnsIfNeeded(Statement s) {
        // Best-effort migration for older installs (SQLite/MySQL). Ignore errors if column exists.
        try {
            s.execute("ALTER TABLE requests ADD COLUMN created_by_discord_id VARCHAR(32)");
        } catch (SQLException ignored) {
        }
        try {
            s.execute("ALTER TABLE requests ADD COLUMN created_by_discord_name VARCHAR(64)");
        } catch (SQLException ignored) {
        }
    }

    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }

    public boolean isMySql() {
        return mySql;
    }

    public void close() {
        if (dataSource != null) {
            dataSource.close();
        }
    }
}

