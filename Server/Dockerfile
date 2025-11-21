FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

# Start server (MongoDB connection will retry automatically)
CMD ["node", "server.js"]
