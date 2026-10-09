const AUDIT_EVENTS = Object.freeze({
    HTTP_REQUEST_COMPLETED: "HTTP_REQUEST_COMPLETED"
});

const AUDIT_METADATA_ALLOW_LIST = Object.freeze({
    [AUDIT_EVENTS.HTTP_REQUEST_COMPLETED]: Object.freeze([
        "durationMs",
        "errorCode",
        "errorSource",
        "statusCode"
    ])
});

export { AUDIT_EVENTS, AUDIT_METADATA_ALLOW_LIST };
