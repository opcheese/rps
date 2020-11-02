FROM heroiclabs/nakama-pluginbuilder:2.14.1 AS builder

ENV GO111MODULE on
ENV CGO_ENABLED 1
ENV GOPRIVATE "github.com/heroiclabs/nakama-project-template"

WORKDIR /backend
COPY . .

RUN go build --trimpath --mod=vendor --buildmode=plugin -o ./backend.so

FROM heroiclabs/nakama:2.14.1

COPY --from=builder /backend/backend.so /nakama/data/modules
COPY --from=builder /backend/*.lua /nakama/data/modules/
COPY --from=builder /backend/local.yml /nakama/data/
