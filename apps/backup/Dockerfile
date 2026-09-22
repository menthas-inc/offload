# The nightly backup. One container, three tools, no application code.
#
# Runs on a schedule and exits. pg_dump reads the database over the private
# network, age seals the dump to a public key whose private half lives with the
# owner and nowhere on any server, and rclone puts the file in R2, which is a
# different company from the one running the database. Security review
# 2026-09-22, M8: the privacy page promised this and nothing did it.
FROM alpine:3.23
RUN apk add --no-cache postgresql18-client age rclone
COPY backup.sh /backup.sh
RUN chmod +x /backup.sh
CMD ["/backup.sh"]
