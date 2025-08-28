FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node . /app
COPY <<'EOF' /usr/bin/docker-entrypoint
#!/bin/sh
export PATH="/app/node_modules/.bin:$PATH"
if [ $# -eq 0 ]; then
  # If no arguments given, use default command
  set -- ponder start
elif [ "${1#-}" != "$1" ]; then
  # If first arg starts with '-', prepend default command
  set -- ponder start "$@"
else
  # Otherwise use args as-is (allows overriding with direct commands)
  set -- ponder "$@"
fi
exec "$@"
EOF
RUN chmod a+x /usr/bin/docker-entrypoint
ENTRYPOINT ["/usr/bin/docker-entrypoint"]

FROM base AS prod-deps
USER node
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base
ENV NODE_ENV=production DATABASE_SCHEMA=app
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
EXPOSE 8000
USER node
CMD ["start", "--port", "8000"]