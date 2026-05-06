FROM alpine:3.19

LABEL org.opencontainers.image.source="https://github.com/KenyanRedwoods01/Orbit"
LABEL org.opencontainers.image.description="Orbit — Security-First Server Management Platform"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL maintainer="KenyanRedwoods01"

# This Dockerfile is used by GoReleaser and receives a pre-built binary.
# For building from source, use the root Dockerfile instead.
#
# orbit needs CAP_NET_ADMIN for firewall and CAP_SYS_PTRACE for /proc access.
# Run with: docker run --cap-add CAP_NET_ADMIN --cap-add CAP_SYS_PTRACE ...

RUN apk add --no-cache ca-certificates tzdata wget && \
    addgroup -S orbit && adduser -S -G orbit orbit

COPY orbit /usr/local/bin/orbit
RUN chmod +x /usr/local/bin/orbit

VOLUME ["/etc/orbit", "/var/lib/orbit"]

# Default port 5000. All Orbit ports must be in range 5000-6000.
EXPOSE 5000

USER orbit
ENTRYPOINT ["/usr/local/bin/orbit"]
CMD ["--config", "/etc/orbit/orbit.toml"]
