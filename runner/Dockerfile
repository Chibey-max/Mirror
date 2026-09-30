FROM node:22-bookworm-slim
WORKDIR /app/runner
COPY runner/package.json runner/package-lock.json ./
RUN npm ci
COPY runner/src ./src
COPY runner/fixtures ./fixtures
COPY deployments /app/deployments
ENV RUNNER_JOURNAL=/data/runner.journal.json RUNNER_LIVE_DIR=/data/live DEPLOYMENT_MANIFEST=/app/deployments/46630.json
# No web server: this is one worker with a persistent /data volume.
CMD ["npm", "run", "watch"]
