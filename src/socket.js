const { Server } = require('socket.io');

function startSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  let currentSlideIndex = 0;

  io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);

    // Send the current slide to newly connected clients
    socket.emit('init-state', { slideIndex: currentSlideIndex });

    // Presenter updates the current slide index
    socket.on('sync-state', (data) => {
      currentSlideIndex = data.slideIndex;
    });

    // Presenter changing slides
    socket.on('slide-change', (data) => {
      // Broadcast to audience
      socket.broadcast.emit('slide-change', data);
    });

    // Presenter moving laser pointer
    socket.on('laser-move', (data) => {
      // Broadcast to audience
      socket.broadcast.emit('laser-move', data);
    });
    
    // Presenter toggling laser pointer
    socket.on('laser-toggle', (data) => {
      socket.broadcast.emit('laser-toggle', data);
    });

    // Presenter loading a new presentation
    socket.on('presentation-reloaded', () => {
      socket.broadcast.emit('presentation-reloaded');
    });

    // Presenter prompting fullscreen
    socket.on('prompt-fullscreen', () => {
      socket.broadcast.emit('prompt-fullscreen');
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}

module.exports = { startSocketServer };
