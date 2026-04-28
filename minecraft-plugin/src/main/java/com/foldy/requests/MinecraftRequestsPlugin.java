package com.foldy.requests;

import com.foldy.requests.api.RequestApiServer;
import com.foldy.requests.config.PluginConfig;
import com.foldy.requests.db.DatabaseManager;
import com.foldy.requests.db.RequestRepository;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.util.logging.Level;

public class MinecraftRequestsPlugin extends JavaPlugin {
    private DatabaseManager databaseManager;
    private RequestApiServer apiServer;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        PluginConfig pluginConfig = PluginConfig.fromBukkit(getConfig());
        try {
            databaseManager = new DatabaseManager(this, pluginConfig);
            databaseManager.connect();
            RequestRepository repository = new RequestRepository(databaseManager);
            apiServer = new RequestApiServer(this, pluginConfig, repository);
            apiServer.start();
            getLogger().info("MinecraftRequestsPlugin enabled");
        } catch (IOException e) {
            getLogger().log(Level.SEVERE, "Failed to start API server", e);
            getServer().getPluginManager().disablePlugin(this);
        } catch (Exception e) {
            getLogger().log(Level.SEVERE, "Fatal startup error", e);
            getServer().getPluginManager().disablePlugin(this);
        }
    }

    @Override
    public void onDisable() {
        if (apiServer != null) {
            apiServer.stop();
        }
        if (databaseManager != null) {
            databaseManager.close();
        }
    }
}

