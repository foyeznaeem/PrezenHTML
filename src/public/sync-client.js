(function() {
  const socket = io();

  // Helper to dispatch a key event (simulating frontend-slides navigation)
  const dispatchKey = (key, keyCode) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
  };

  // Sync to current slide on connection
  socket.on('init-state', (data) => {
    // Wait a brief moment to ensure presentation framework has initialized
    setTimeout(() => {
      const slides = Array.from(document.querySelectorAll('.slide'));
      if (slides.length === 0) return;
      
      const activeSlide = document.querySelector('.slide.active') || slides[0];
      const currentIndex = slides.indexOf(activeSlide);
      const targetIndex = data.slideIndex || 0;
      
      if (currentIndex < targetIndex) {
        for (let i = currentIndex; i < targetIndex; i++) dispatchKey('ArrowRight', 39);
      } else if (currentIndex > targetIndex) {
        for (let i = currentIndex; i > targetIndex; i--) dispatchKey('ArrowLeft', 37);
      }
    }, 100);
  });

  // Listen for slide change commands from the presenter
  socket.on('slide-change', (data) => {
    const { action } = data;
    
    // Most HTML presentation frameworks (reveal.js, html-slides, etc.) 
    // support keyboard navigation.
    const key = action === 'next' ? 'ArrowRight' : 'ArrowLeft';
    const keyCode = action === 'next' ? 39 : 37;

    dispatchKey(key, keyCode);
  });

  // Handle laser pointer toggle
  socket.on('laser-toggle', (data) => {
    const laserPointer = document.getElementById('laser-pointer');
    if (laserPointer) {
      laserPointer.style.display = data.active ? 'block' : 'none';
    }
  });

  // Handle presentation reloaded
  socket.on('presentation-reloaded', () => {
    window.location.reload();
  });

  // Handle remote fullscreen prompt
  socket.on('prompt-fullscreen', () => {
    if (document.fullscreenElement) return; // Already fullscreen

    let overlay = document.getElementById('fullscreen-prompt-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fullscreen-prompt-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:999999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(10px);';
      
      const btn = document.createElement('button');
      btn.textContent = 'Tap to Start Fullscreen';
      btn.style.cssText = 'padding:20px 40px;font-size:24px;border-radius:12px;background:#2ecc71;color:white;border:none;cursor:pointer;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-family:system-ui, sans-serif;font-weight:bold;';
      
      btn.addEventListener('click', () => {
        const docEl = document.documentElement;
        const requestFullscreen = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
        if (requestFullscreen) {
          requestFullscreen.call(docEl).catch(err => console.error("Fullscreen error:", err));
        }
        overlay.remove();
      });
      
      overlay.appendChild(btn);
      document.body.appendChild(overlay);
    }
  });

  // Handle laser pointer move
  socket.on('laser-move', (data) => {
    const laserPointer = document.getElementById('laser-pointer');
    if (laserPointer) {
      // Automatically show if it was hidden (e.g. connected after toggle)
      if (laserPointer.style.display === 'none' || !laserPointer.style.display) {
        laserPointer.style.display = 'block';
      }
      
      // data.x and data.y are percentages (0 to 1)
      const x = data.x * window.innerWidth;
      const y = data.y * window.innerHeight;
      
      // Center the dot on the cursor using CSS transform for better performance
      laserPointer.style.transform = `translate(${x - 6}px, ${y - 6}px)`;
      laserPointer.style.left = '0';
      laserPointer.style.top = '0';
    }
  });
})();
