// Elements
const btnOpenFile = document.getElementById('btn-open-file');
const btnAudience = document.getElementById('btn-audience');
const btnForceFullscreen = document.getElementById('btn-force-fullscreen');
const dashboardMain = document.getElementById('dashboard-main');
const emptyState = document.getElementById('empty-state');
const frameCurrent = document.getElementById('frame-current');
const frameNext = document.getElementById('frame-next');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnLaser = document.getElementById('btn-laser');
const slideCounter = document.getElementById('slide-counter');
const timerEl = document.getElementById('timer');
const notesInput = document.getElementById('notes-input');
const saveIndicator = document.getElementById('save-indicator');
const btnFontDecrease = document.getElementById('btn-font-decrease');
const btnFontIncrease = document.getElementById('btn-font-increase');
const btnShare = document.getElementById('btn-share');
const shareModal = document.getElementById('share-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const qrCodeImg = document.getElementById('qr-code-img');
const shareUrl = document.getElementById('share-url');

// Window Control Elements
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

// Window Controls Event Listeners
if (btnMinimize && window.electronAPI) {
  btnMinimize.addEventListener('click', () => window.electronAPI.minimizeWindow());
  btnMaximize.addEventListener('click', () => window.electronAPI.maximizeWindow());
  btnClose.addEventListener('click', () => window.electronAPI.closeWindow());
}

// Hamburger Menu Elements
const btnHamburger = document.getElementById('btn-hamburger');
const btnCloseHamburger = document.getElementById('btn-close-hamburger');
const hamburgerOverlay = document.getElementById('hamburger-overlay');
const hamburgerBackdrop = document.getElementById('hamburger-backdrop');

function toggleHamburger() {
  if (hamburgerOverlay) {
    hamburgerOverlay.classList.toggle('hidden');
  }
}

function closeHamburger() {
  if (hamburgerOverlay) {
    hamburgerOverlay.classList.add('hidden');
  }
}

if (btnHamburger) {
  btnHamburger.addEventListener('click', toggleHamburger);
  if (btnCloseHamburger) btnCloseHamburger.addEventListener('click', toggleHamburger);
  if (hamburgerBackdrop) hamburgerBackdrop.addEventListener('click', toggleHamburger);
}

// Theme Toggle Logic
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const iconMoon = document.getElementById('icon-moon');
const iconSun = document.getElementById('icon-sun');

function setTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-theme');
    if (iconMoon) iconMoon.style.display = 'none';
    if (iconSun) iconSun.style.display = 'block';
    localStorage.setItem('prezenhtml-theme', 'light');
  } else {
    document.body.classList.remove('light-theme');
    if (iconMoon) iconMoon.style.display = 'block';
    if (iconSun) iconSun.style.display = 'none';
    localStorage.setItem('prezenhtml-theme', 'dark');
  }
}

if (btnThemeToggle) {
  const savedTheme = localStorage.getItem('prezenhtml-theme');
  if (savedTheme === 'light') {
    setTheme(true);
  }
  btnThemeToggle.addEventListener('click', () => {
    const isCurrentlyLight = document.body.classList.contains('light-theme');
    setTheme(!isCurrentlyLight);
  });
}

// State
let socket = null;
let currentSlideIndex = 0; // if we can track it
let presentationLoaded = false;
let laserActive = false;
let timerRunning = false;
let accumulatedTime = 0;
let lastTickTime = null;
let timerInterval = null;
let saveTimeout = null;

// Connect to local WebSocket
function connectSocket() {
  if (typeof io !== 'undefined') {
    socket = io('http://localhost:4567');
    socket.on('connect', () => {
      console.log('Connected to local sync server');
    });
  } else {
    console.warn('Socket.io client not loaded yet. Will retry in 1s.');
    setTimeout(connectSocket, 1000);
  }
}

connectSocket();

// Format time for timer
function updateTimer() {
  if (timerRunning && lastTickTime) {
    const now = Date.now();
    accumulatedTime += (now - lastTickTime);
    lastTickTime = now;
  }
  
  const diff = Math.floor(accumulatedTime / 1000);
  const m = Math.floor(diff / 60).toString().padStart(2, '0');
  const s = (diff % 60).toString().padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

const btnTimerToggle = document.getElementById('btn-timer-toggle');
const btnTimerReset = document.getElementById('btn-timer-reset');
const iconPause = document.getElementById('icon-pause');
const iconPlay = document.getElementById('icon-play');

if (btnTimerToggle) {
  btnTimerToggle.addEventListener('click', () => {
    if (timerRunning) {
      // Pause
      timerRunning = false;
      updateTimer(); // final update
      iconPause.style.display = 'none';
      iconPlay.style.display = 'block';
    } else {
      // Resume
      timerRunning = true;
      lastTickTime = Date.now();
      iconPause.style.display = 'block';
      iconPlay.style.display = 'none';
    }
  });
}

if (btnTimerReset) {
  btnTimerReset.addEventListener('click', () => {
    accumulatedTime = 0;
    if (timerRunning) {
      lastTickTime = Date.now();
    }
    updateTimer();
  });
}

// Mode Selection Elements
const modeModal = document.getElementById('mode-modal');
const btnCloseModeModal = document.getElementById('btn-close-mode-modal');
const btnModeDashboard = document.getElementById('btn-mode-dashboard');
const btnModeFullscreen = document.getElementById('btn-mode-fullscreen');

function setupDashboard() {
  presentationLoaded = true;
  emptyState.style.display = 'none';
  dashboardMain.style.display = 'grid';
  
  // Notify audience clients to reload
  if (socket) {
    socket.emit('presentation-reloaded');
  }
  
  // Enable buttons
  btnAudience.disabled = false;
  btnForceFullscreen.disabled = false;
  btnShare.disabled = false;
  
  const btnExportPPTX = document.getElementById('btn-export-pptx');
  if (btnExportPPTX) btnExportPPTX.disabled = false;
  
  // Fetch network info for share modal
  fetch('http://localhost:4567/network-info')
    .then(res => res.json())
    .then(data => {
      qrCodeImg.src = data.qr;
      shareUrl.textContent = data.url;
      shareUrl.href = data.url;
    })
    .catch(console.error);

  // Start timer
  accumulatedTime = 0;
  timerRunning = true;
  lastTickTime = Date.now();
  if (iconPause) iconPause.style.display = 'block';
  if (iconPlay) iconPlay.style.display = 'none';
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  
  // Load into iframes with cache buster to force full reload
  const t = Date.now();
  frameCurrent.src = `http://localhost:4567/presenter?t=${t}`;
  frameNext.src = `http://localhost:4567/presenter?t=${t}#2`;
  
  // Send a command to next slide to advance by 1
  // Wait for frame to load then simulate next
  frameNext.onload = () => {
    // Small hack: send postMessage to next frame to keep it 1 step ahead
    setTimeout(() => {
      try {
        frameNext.contentWindow.postMessage({ action: 'goto', index: currentSlideIndex + 1 }, '*');
      } catch(e) {
        console.error("Cannot dispatch message to next frame", e);
      }
    }, 500);
  };
}

// Open File
btnOpenFile.addEventListener('click', async () => {
  closeHamburger();
  const filePath = await window.electronAPI.openFileDialog();
  if (filePath) {
    modeModal.style.display = 'flex';
  }
});

btnCloseModeModal.addEventListener('click', () => {
  modeModal.style.display = 'none';
});

btnModeDashboard.addEventListener('click', () => {
  modeModal.style.display = 'none';
  setupDashboard();
});

btnModeFullscreen.addEventListener('click', () => {
  modeModal.style.display = 'none';
  // We still notify clients in case there are remote viewers
  if (socket) {
    socket.emit('presentation-reloaded');
  }
  window.electronAPI.openFullscreenPresentation();
});

// Open Audience View
btnAudience.addEventListener('click', () => {
  closeHamburger();
  if (presentationLoaded) {
    window.electronAPI.openAudienceView();
  }
});

const btnExportPPTX = document.getElementById('btn-export-pptx');
if (btnExportPPTX) {
  const exportToast = document.getElementById('export-toast');
  const exportToastIcon = document.getElementById('export-toast-icon');
  const exportToastTitle = document.getElementById('export-toast-title');
  const exportToastText = document.getElementById('export-toast-text');
  
  const loaderSVG = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
  const successSVG = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;

  // Set up progress listener only once
  if (!window.exportProgressListenerAdded) {
    window.electronAPI.onExportProgress((progress) => {
      if (progress.stage === 'extracting') {
        exportToastText.textContent = `Extracting ${progress.current}/${progress.total}...`;
      } else if (progress.stage === 'generating') {
        exportToastText.textContent = 'Saving PPTX...';
      }
    });
    window.exportProgressListenerAdded = true;
  }

  btnExportPPTX.addEventListener('click', async () => {
    closeHamburger();
    if (presentationLoaded) {
      exportToast.style.display = 'flex';
      exportToastIcon.innerHTML = loaderSVG;
      exportToastTitle.textContent = 'Exporting to PPTX';
      exportToastText.textContent = 'Starting...';
      try {
        const success = await window.electronAPI.exportToPPTX();
        if (success) {
          exportToastIcon.innerHTML = successSVG;
          exportToastTitle.textContent = 'Success!';
          exportToastText.textContent = 'Your presentation has been saved.';
          setTimeout(() => {
            exportToast.style.display = 'none';
          }, 3000);
          return;
        }
      } catch (e) {
        console.error(e);
      }
      exportToast.style.display = 'none';
    }
  });
}

// Share Modal Actions
btnShare.addEventListener('click', () => {
  closeHamburger();
  shareModal.style.display = 'flex';
});

btnCloseModal.addEventListener('click', () => {
  shareModal.style.display = 'none';
});

// Force Fullscreen Action
btnForceFullscreen.addEventListener('click', () => {
  closeHamburger();
  if (socket) {
    socket.emit('prompt-fullscreen');
  }
});

// Close modal when clicking outside
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) {
    shareModal.style.display = 'none';
  }
});

// Navigation
function navigate(direction) {
  if (!presentationLoaded || !socket) return;
  
  // Send to audience
  socket.emit('slide-change', { action: direction });
  
  // Also navigate local iframes via postMessage
  try {
    frameCurrent.contentWindow.postMessage({ action: direction }, '*');
  } catch(e) {}
}

btnPrev.addEventListener('click', () => navigate('prev'));
btnNext.addEventListener('click', () => navigate('next'));

// Keyboard navigation from presenter window
window.addEventListener('keydown', (e) => {
  // Do not intercept keystrokes if the user is typing in an input or textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  if (e.key === 'ArrowRight') {
    navigate('next');
  } else if (e.key === 'ArrowLeft') {
    navigate('prev');
  }
});

const currentOverlay = document.getElementById('current-overlay');
const localLaserPointer = document.getElementById('local-laser-pointer');

// Laser pointer
btnLaser.addEventListener('click', () => {
  laserActive = !laserActive;
  btnLaser.classList.toggle('active', laserActive);
  
  if (socket) {
    socket.emit('laser-toggle', { active: laserActive });
  }
  
  if (laserActive) {
    currentOverlay.style.pointerEvents = 'auto';
    currentOverlay.style.cursor = 'none'; // Hide native cursor in laser mode
    localLaserPointer.style.display = 'block';
  } else {
    currentOverlay.style.pointerEvents = 'none';
    currentOverlay.style.cursor = 'default';
    localLaserPointer.style.display = 'none';
  }
});

// Mouse move over current slide for laser pointer
// We use a transparent div overlay to capture mouse events
let lastLaserTime = 0;
currentOverlay.addEventListener('mousemove', (e) => {
  if (laserActive) {
    // Get mouse coordinates relative to the overlay
    const rect = currentOverlay.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    
    // Move local laser dot (we can update local dot immediately for low latency)
    localLaserPointer.style.transform = `translate(${localX - 6}px, ${localY - 6}px)`;
    localLaserPointer.style.left = '0';
    localLaserPointer.style.top = '0';
    
    // Throttle network emitting to ~30fps (33ms) to avoid network lag
    const now = Date.now();
    if (now - lastLaserTime > 33) {
      lastLaserTime = now;
      
      // Send to audience
      if (socket) {
        const x = localX / rect.width;
        const y = localY / rect.height;
        socket.emit('laser-move', { x, y });
      }
    }
  }
});

// Notes auto-save logic
notesInput.addEventListener('input', () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  
  // IMMEDIATELY update the iframe DOM so it's in sync with the text area
  try {
    frameCurrent.contentWindow.postMessage({ action: 'updateNoteInDom', text: notesInput.value }, '*');
  } catch(e) {}
  
  saveTimeout = setTimeout(saveNotes, 500);
});

// Font size logic
let currentFontSize = 16;
if (btnFontDecrease && btnFontIncrease) {
  btnFontDecrease.addEventListener('click', () => {
    currentFontSize = Math.max(12, currentFontSize - 2);
    notesInput.style.fontSize = `${currentFontSize}px`;
  });
  
  btnFontIncrease.addEventListener('click', () => {
    currentFontSize = Math.min(48, currentFontSize + 2);
    notesInput.style.fontSize = `${currentFontSize}px`;
  });
}


async function saveNotes() {
  if (!presentationLoaded) return;
  const text = notesInput.value;
  try {
    const res = await fetch('http://localhost:4567/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: currentSlideIndex, text })
    });
    const data = await res.json();
    if (data.success) {
      saveIndicator.style.opacity = '1';
      setTimeout(() => {
        saveIndicator.style.opacity = '0';
      }, 2000);
    }
  } catch(e) {
    console.error("Failed to save notes", e);
  }
}

// Listen for messages from iframes
window.addEventListener('message', (event) => {
  // Only accept sync messages from the main presenter view, ignore the preview frame
  if (event.source !== frameCurrent.contentWindow) return;

  if (event.data && event.data.type === 'slideSync') {
    currentSlideIndex = event.data.index;
    const totalSlides = event.data.total || '?';
    slideCounter.textContent = `${currentSlideIndex + 1} / ${totalSlides}`;
    
    // Sync with backend so late joiners know the current slide
    if (socket) {
      socket.emit('sync-state', { slideIndex: currentSlideIndex });
    }
    
    // Only update textarea if user isn't actively typing (to avoid cursor jumping)
    if (document.activeElement !== notesInput) {
      notesInput.value = event.data.notes || '';
    }
    
    // Force frameNext to sync to currentSlideIndex + 1
    const targetNextIndex = Math.min(currentSlideIndex + 1, (event.data.total || 1) - 1);
    try {
      frameNext.contentWindow.postMessage({ action: 'goto', index: targetNextIndex }, '*');
    } catch(e) {}
  }
});
