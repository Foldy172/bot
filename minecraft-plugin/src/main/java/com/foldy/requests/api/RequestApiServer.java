package com.foldy.requests.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.foldy.requests.config.PluginConfig;
import com.foldy.requests.db.RequestRepository;
import com.foldy.requests.model.RequestRecord;
import com.foldy.requests.model.RequestStatus;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.logging.Level;

public class RequestApiServer {
    private final JavaPlugin plugin;
    private final PluginConfig config;
    private final RequestRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private HttpServer server;

    public RequestApiServer(JavaPlugin plugin, PluginConfig config, RequestRepository repository) {
        this.plugin = plugin;
        this.config = config;
        this.repository = repository;
    }

    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(config.apiHost(), config.apiPort()), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/api/health", new HealthHandler());
        server.createContext("/api/requests", new RequestCreateHandler());
        server.createContext("/api/requests/", new RequestStatusHandler());
        server.createContext("/api/whitelist/remove", new WhitelistRemoveHandler());
        server.start();
        plugin.getLogger().info("API server started on " + config.apiHost() + ":" + config.apiPort());
    }

    public void stop() {
        if (server != null) {
            server.stop(2);
        }
    }

    private boolean checkSecret(HttpExchange exchange) throws IOException {
        String header = exchange.getRequestHeaders().getFirst("X-API-KEY");
        if (header == null || !header.equals(config.apiSecret())) {
            sendJson(exchange, 401, Map.of("error", "Unauthorized"));
            return false;
        }
        return true;
    }

    private void sendJson(HttpExchange exchange, int status, Object payload) throws IOException {
        byte[] body = objectMapper.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private class HealthHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Map.of("error", "Method not allowed"));
                return;
            }
            sendJson(exchange, 200, Map.of("ok", true));
        }
    }

    private class RequestCreateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!checkSecret(exchange)) {
                return;
            }
            if (!"POST".equals(exchange.getRequestMethod()) && !"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Map.of("error", "Method not allowed"));
                return;
            }
            try {
                if ("GET".equals(exchange.getRequestMethod())) {
                    List<RequestRecord> all = repository.findAll();
                    sendJson(exchange, 200, all);
                    return;
                }
                try (InputStream is = exchange.getRequestBody()) {
                    ApiRequest payload = objectMapper.readValue(is, ApiRequest.class);
                    RequestRecord record = new RequestRecord(
                            payload.id(),
                            payload.playerName(),
                            payload.edition() == null ? "Java" : payload.edition(),
                            payload.status() == null ? RequestStatus.PENDING : RequestStatus.fromString(payload.status()),
                            payload.admin(),
                            payload.createdByDiscordId(),
                            payload.createdByDiscordName(),
                            Instant.now(),
                            Instant.now()
                    );
                    repository.upsert(record);
                    if (record.status() == RequestStatus.ACCEPTED) {
                        applyWhitelist(record.playerName());
                    }
                    sendJson(exchange, 200, Map.of("ok", true, "id", record.id()));
                }
            } catch (Exception e) {
                plugin.getLogger().log(Level.SEVERE, "Create request API error", e);
                sendJson(exchange, 500, Map.of("error", "internal_error"));
            }
        }
    }

    private class RequestStatusHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!checkSecret(exchange)) {
                return;
            }
            if (!"POST".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Map.of("error", "Method not allowed"));
                return;
            }
            String path = exchange.getRequestURI().getPath();
            String[] split = path.split("/");
            if (split.length < 5 || !"status".equals(split[4])) {
                sendJson(exchange, 404, Map.of("error", "not_found"));
                return;
            }
            String requestId = split[3];
            try (InputStream is = exchange.getRequestBody()) {
                Map<?, ?> payload = objectMapper.readValue(is, Map.class);
                String statusRaw = String.valueOf(payload.get("status"));
                RequestStatus status = RequestStatus.fromString(statusRaw);
                repository.updateStatus(requestId, status);
                if (status == RequestStatus.ACCEPTED) {
                    repository.findById(requestId).ifPresent(record -> applyWhitelist(record.playerName()));
                }
                Map<String, Object> resp = new HashMap<>();
                resp.put("ok", true);
                resp.put("id", requestId);
                resp.put("status", status.name());
                sendJson(exchange, 200, resp);
            } catch (Exception e) {
                plugin.getLogger().log(Level.SEVERE, "Status API error", e);
                sendJson(exchange, 500, Map.of("error", "internal_error"));
            }
        }
    }

    private class WhitelistRemoveHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!checkSecret(exchange)) {
                return;
            }
            if (!"POST".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Map.of("error", "Method not allowed"));
                return;
            }
            try (InputStream is = exchange.getRequestBody()) {
                Map<?, ?> payload = objectMapper.readValue(is, Map.class);
                String playerName = payload.get("playerName") == null ? null : String.valueOf(payload.get("playerName")).trim();
                if (playerName == null || playerName.isBlank()) {
                    sendJson(exchange, 400, Map.of("error", "playerName_required"));
                    return;
                }
                Bukkit.getScheduler().runTask(plugin, () -> {
                    OfflinePlayer offlinePlayer = Bukkit.getOfflinePlayer(playerName);
                    offlinePlayer.setWhitelisted(false);
                    plugin.getLogger().info("Player " + playerName + " was removed from whitelist via API");
                });
                sendJson(exchange, 200, Map.of("ok", true, "playerName", playerName));
            } catch (Exception e) {
                plugin.getLogger().log(Level.SEVERE, "Whitelist remove API error", e);
                sendJson(exchange, 500, Map.of("error", "internal_error"));
            }
        }
    }

    private void applyWhitelist(String playerName) {
        if (!config.whitelistOnAccept()) {
            return;
        }
        Bukkit.getScheduler().runTask(plugin, () -> {
            OfflinePlayer offlinePlayer = Bukkit.getOfflinePlayer(playerName);
            offlinePlayer.setWhitelisted(true);
            plugin.getLogger().info("Player " + playerName + " was whitelisted by accepted request");
        });
    }

    public record ApiRequest(
            String id,
            String playerName,
            String edition,
            String status,
            boolean admin,
            String createdByDiscordId,
            String createdByDiscordName
    ) {
    }
}

