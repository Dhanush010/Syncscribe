# SyncScribe - Collaborative Document Editor

A real-time collaborative document editing application built with React, Node.js, WebSockets, and MongoDB.

## Features

- ✅ **JWT Authentication** - User registration and login
- ✅ **Real-time Collaboration** - Multiple users can edit documents simultaneously
- ✅ **Live Cursors** - See where other users are typing
- ✅ **Presence Indicators** - See who's currently editing
- ✅ **Version History** - Save and restore document versions
- ✅ **Comments & Replies** - Add comments to document sections
- ✅ **Document Sharing** - Share documents with other users
- ✅ **Export Options** - Export to PDF, DOCX, TXT, and Markdown
- ✅ **Offline Support** - Auto-reconnect and localStorage backup
- ✅ **Collaborative Highlights** - Highlight text in real-time

## Prerequisites

- **Docker** and **Docker Compose** installed on your system
- At least 4GB of available RAM
- Ports 5000, 5173, and 27017 available

## Quick Start

### 1. Clone/Navigate to the Project

```bash
cd SyncScribe
```

### 2. Build and Start All Services

```bash
docker-compose up --build
```

This command will:
- Build the client, server, and MongoDB containers
- Start all services in the correct order
- Wait for MongoDB to be healthy before starting the server

### 3. Access the Application

Once all containers are running, open your browser and navigate to:

**Client Application:** http://localhost:5173

**Server API:** http://localhost:5000

**MongoDB:** localhost:27017 (if you need direct database access)

## First Time Setup

1. **Open the application** at http://localhost:5173
2. **Register a new account** by clicking "Register" and providing:
   - Username
   - Email
   - Password
3. **Login** with your credentials
4. **Create your first document** by clicking "+ New Document"

## Running Commands

### Start Services (in background)
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### Stop Services and Remove Volumes (⚠️ This deletes all data)
```bash
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f mongo
```

### Restart a Specific Service
```bash
docker-compose restart server
docker-compose restart client
```

### Rebuild After Code Changes
```bash
# Rebuild and restart
docker-compose up --build

# Or rebuild specific service
docker-compose build server
docker-compose up -d server
```

## Project Structure

```
SyncScribe/
├── Client/
│   └── Client/          # React frontend (Vite)
│       ├── src/
│       │   ├── App.jsx
│       │   ├── components/
│       │   └── api/
│       └── Dockerfile
├── Server/              # Node.js backend (Express + WebSocket)
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── server.js
│   └── Dockerfile
├── docker-compose.yml   # Docker orchestration
└── README.md
```

## Environment Variables

The application uses the following environment variables (configured in `docker-compose.yml`):

### Server
- `MONGO_URL` - MongoDB connection string
- `MONGO_URI` - MongoDB connection string (alias)
- `JWT_SECRET` - Secret key for JWT tokens (⚠️ Change in production!)
- `CLIENT_URL` - Frontend URL for CORS

### Client
- `VITE_API_URL` - Backend API URL
- `VITE_WS_URL` - WebSocket server URL

## Troubleshooting

### Port Already in Use
If you get a port conflict error:
```bash
# Check what's using the port
netstat -ano | findstr :5000  # Windows
lsof -i :5000                 # Mac/Linux

# Or change ports in docker-compose.yml
```

### Containers Won't Start
```bash
# Check logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose up --build
```

### Database Connection Issues
```bash
# Check MongoDB health
docker-compose ps mongo

# Restart MongoDB
docker-compose restart mongo
```

### Client Can't Connect to Server
- Ensure `VITE_API_URL` and `VITE_WS_URL` in `docker-compose.yml` match your setup
- Check that the server container is running: `docker-compose ps server`
- Check server logs: `docker-compose logs server`

### Editor Content Not Showing
- Clear browser cache and localStorage
- Open browser console (F12) and check for errors
- Check server logs for DOC_SYNC messages
- Try refreshing the page

## Development

### Running Without Docker (Local Development)

#### Server
```bash
cd Server
npm install
# Create .env file with:
# MONGO_URL=mongodb://localhost:27017/realtimenotes
# JWT_SECRET=your_secret
# CLIENT_URL=http://localhost:5173
npm start
```

#### Client
```bash
cd Client/Client
npm install
# Create .env file with:
# VITE_API_URL=http://localhost:5000/api
# VITE_WS_URL=ws://localhost:5000
npm run dev
```

## Production Deployment

⚠️ **Important for Production:**

1. **Change JWT_SECRET** in `docker-compose.yml` to a strong random string
2. **Update CORS settings** in `Server/server.js` to allow only your domain
3. **Use environment variables** for sensitive data (don't hardcode)
4. **Enable HTTPS** for WebSocket connections (wss://)
5. **Set up proper MongoDB authentication**
6. **Use a reverse proxy** (nginx) for production
7. **Configure proper logging** and monitoring

## Support

For issues or questions, check the logs first:
```bash
docker-compose logs -f
```

## License

This project is for educational/demonstration purposes.

