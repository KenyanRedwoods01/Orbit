FROM alpine:3.19

# orbit needs CAP_NET_ADMIN for firewall and CAP_SYS_PTRACE for /proc access.
# Run with: docker run --cap-add CAP_NET_ADMIN --cap-add CAP_SYS_PTRACE ...

RUN addgroup -S orbit && adduser -S -G orbit orbit

COPY orbit /usr/local/bin/orbit
RUN chmod +x /usr/local/bin/orbit

VOLUME ["/etc/orbit", "/var/lib/orbit"]
EXPOSE 3900

USER orbit
ENTRYPOINT ["/usr/local/bin/orbit"]
CMD ["--config", "/etc/orbit/orbit.toml"]
