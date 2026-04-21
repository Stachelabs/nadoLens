FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json ./
RUN bun install --frozen-lockfile
COPY . .
EXPOSE 3001
CMD ["bun", "run", "index.ts"]
