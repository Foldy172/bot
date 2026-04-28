package com.foldy.requests.model;

public enum RequestStatus {
    PENDING,
    ACCEPTED,
    REJECTED;

    public static RequestStatus fromString(String value) {
        return RequestStatus.valueOf(value.trim().toUpperCase());
    }
}

