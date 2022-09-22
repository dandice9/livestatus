const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const { User } = require('./models')
const io = new Server(server);

app.get('/', (req, res) => {
    return res.send('ok')
});

app.use(express.static('public'))

async function updateUser(data){
    const { id: userId, status } = data

    const [user, isCreated] = await User.findOrCreate({
        where: {
            userId
        },
        defaults: {
            userId,
            status
        }
    })

    if(!isCreated){
        user.status = status
        user.save()
    }
}

const socketList = {}, userCache = {};

// first initialize
User.findAll().then(users => {
    for(let user of users){
        userCache[user.userId] = {
            status: user.status
        }
    }
})

io.on('connection', (socket) => {
    const socketId = socket.id

    socketList[socketId] = socket
    
    socket.on('agent sub', (data) => {
        const { id, status } = data
        
        let cachedStatus = status
        if(userCache[id]){
            userCache[id].socketId = socketId
            cachedStatus = userCache[id].status
        }
        else {
            userCache[id] = {
                socketId,
                status
            }
        }

        socket.emit('agent update', {
            id, status: cachedStatus
        })

        socket.to('admin room').emit('agent update', {
            id, status: cachedStatus
        })

        if(socketList[socketId])
            socketList[socketId].userId = id
            
        socket.join('agent room')

        updateUser(data)
    })

    socket.on('admin sub', (data) => {
        const userList = []
        for(const key in userCache){
            userList.push({
                id: key,
                ...userCache[key]
            })
        }
        socket.join('admin room')
        socket.emit('admin sub', userList)
    })

    socket.on('agent update', async (data) => {
        const uc = userCache[data.id]
        if(uc){
            uc.status = data.status
            socket.to('admin room').emit('agent update', data)
            socket.to('agent room').emit('agent update', data)
            updateUser(data)
        }
    })
    
    socket.on('disconnect', () => {
        const userId = socketList[socketId].userId
        if(userId && userCache[userId]){
            const uc = userCache[userId]
            uc.status = 'offline'
            delete uc.socketId

            const data = {
                id: userId,
                status: 'offline'
            }
            socket.to('agent room').emit('agent update', data)

            updateUser(data)
        }

        // remove object
        delete socketList[socketId]
    });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});