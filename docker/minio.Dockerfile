FROM golang:1.24.2-alpine AS builder

RUN apk add --no-cache git

ARG MINIO_COMMIT=0d7408fc9969caf07de6a8c3a84f9fbb10a6739e
ARG MC_COMMIT=b00526b153a31b36767991a4f5ce2cced435ee8e

WORKDIR /src/minio
RUN git init \
    && git remote add origin https://github.com/minio/minio.git \
    && git fetch --depth 1 origin "${MINIO_COMMIT}" \
    && git checkout --detach FETCH_HEAD
RUN CGO_ENABLED=0 go build -trimpath -o /out/minio .

WORKDIR /src/mc
RUN git init \
    && git remote add origin https://github.com/minio/mc.git \
    && git fetch --depth 1 origin "${MC_COMMIT}" \
    && git checkout --detach FETCH_HEAD
RUN CGO_ENABLED=0 go build -trimpath -o /out/mc .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates curl
COPY --from=builder /out/minio /usr/local/bin/minio
COPY --from=builder /out/mc /usr/local/bin/mc

ENTRYPOINT ["/usr/local/bin/minio"]
