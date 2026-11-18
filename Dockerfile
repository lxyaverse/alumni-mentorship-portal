FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ sqlite3 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Ensure data directory exists
RUN mkdir -p /app/data

ENV PORT=3000
ENV NODE_ENV=production
ENV DEMO=1

EXPOSE 3000

CMD ["npm", "start"]
