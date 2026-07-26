const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const os = require('os');
const QRCode = require('qrcode');

function startServer(port) {
  const app = express();
  const server = http.createServer(app);

  app.set('slideFile', null); // Path to the currently selected HTML file

  // Middleware for parsing JSON bodies
  app.use(express.json());

  // Serve the public directory (for sync-client.js and any other assets)
  app.use('/public', express.static(path.join(__dirname, 'public')));

  // Audience view route
  app.get('/audience', (req, res) => {
    const slideFile = app.get('slideFile');
    if (!slideFile || !fs.existsSync(slideFile)) {
      return res.status(404).send('<h1>No presentation selected or file not found</h1>');
    }

    try {
      let content = fs.readFileSync(slideFile, 'utf-8');
      
      // Inject the sync client script before the closing </head> tag or at the end of the file
      const injectScript = `
        <script src="/socket.io/socket.io.js"></script>
        <script src="/public/sync-client.js"></script>
        <style>
          /* Laser pointer styles */
          #laser-pointer {
            position: fixed;
            width: 12px;
            height: 12px;
            background-color: red;
            border-radius: 50%;
            pointer-events: none;
            z-index: 2147483647;
            display: none;
            box-shadow: 0 0 10px red, 0 0 20px red;
            transition: left 0.05s linear, top 0.05s linear;
          }
        </style>
      `;

      if (content.includes('</head>')) {
        content = content.replace('</head>', `${injectScript}</head>`);
      } else {
        content += injectScript;
      }
      
      // Inject a laser pointer element at the end of body
      if (content.includes('</body>')) {
        content = content.replace('</body>', '<div id="laser-pointer"></div></body>');
      } else {
        content += '<div id="laser-pointer"></div>';
      }

      res.send(content);
    } catch (err) {
      console.error('Error reading slide file:', err);
      res.status(500).send('Error loading presentation.');
    }
  });

  // Presenter view iframes route (serve with postMessage listener injected)
  app.get('/presenter', (req, res) => {
    const slideFile = app.get('slideFile');
    if (!slideFile || !fs.existsSync(slideFile)) {
      return res.status(404).send('<h1>No presentation selected</h1>');
    }
    
    try {
      let content = fs.readFileSync(slideFile, 'utf-8');
      const injectScript = `
        <script>
          // Send slide sync info to parent
          function syncSlideInfo() {
            const activeSlide = document.querySelector('.slide.active');
            if (!activeSlide) return;
            const slides = Array.from(document.querySelectorAll('.slide'));
            const index = slides.indexOf(activeSlide);
            const notesEl = activeSlide.querySelector('.speaker-notes');
            const notesText = notesEl ? notesEl.textContent : '';
            window.parent.postMessage({ type: 'slideSync', index, total: slides.length, notes: notesText }, '*');
          }

          // Observe for slide changes
          const observer = new MutationObserver((mutations) => {
            for (let m of mutations) {
              if (m.attributeName === 'class' && m.target.classList.contains('active')) {
                syncSlideInfo();
              }
            }
          });
          
          window.addEventListener('load', () => {
            syncSlideInfo();
            document.querySelectorAll('.slide').forEach(slide => {
              observer.observe(slide, { attributes: true });
            });
          });

          window.addEventListener('message', (event) => {
            if (event.data && event.data.action) {
              if (event.data.action === 'next' || event.data.action === 'prev') {
                const key = event.data.action === 'next' ? 'ArrowRight' : 'ArrowLeft';
                const keyCode = event.data.action === 'next' ? 39 : 37;
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: key, code: key, keyCode: keyCode, which: keyCode, bubbles: true }));
                document.body.dispatchEvent(new KeyboardEvent('keyup', { key: key, code: key, keyCode: keyCode, which: keyCode, bubbles: true }));
              } else if (event.data.action === 'goto') {
                const targetIndex = event.data.index;
                const slides = Array.from(document.querySelectorAll('.slide'));
                if (slides.length === 0) return;
                const activeSlide = document.querySelector('.slide.active') || slides[0];
                const currentIndex = slides.indexOf(activeSlide);
                
                const dispatchKey = (key, keyCode) => {
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
                    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
                };

                if (currentIndex < targetIndex) {
                    for (let i = currentIndex; i < targetIndex; i++) dispatchKey('ArrowRight', 39);
                } else if (currentIndex > targetIndex) {
                    for (let i = currentIndex; i > targetIndex; i--) dispatchKey('ArrowLeft', 37);
                }
              } else if (event.data.action === 'updateNoteInDom') {
                const activeSlide = document.querySelector('.slide.active');
                if (activeSlide) {
                  let notesEl = activeSlide.querySelector('.speaker-notes');
                  if (!notesEl) {
                    notesEl = document.createElement('aside');
                    notesEl.className = 'speaker-notes';
                    notesEl.style.display = 'none';
                    activeSlide.appendChild(notesEl);
                  }
                  notesEl.textContent = event.data.text;
                }
              }
            }
          });
        </script>
      `;
      if (content.includes('</head>')) {
        content = content.replace('</head>', `${injectScript}</head>`);
      } else {
        content += injectScript;
      }
      res.send(content);
    } catch (err) {
      console.error('Error serving presenter view:', err);
      res.sendFile(slideFile); // fallback
    }
  });

  // POST /notes - Save speaker notes to the presentation file
  app.post('/notes', (req, res) => {
    const { index, text } = req.body;
    const slideFile = app.get('slideFile');
    
    if (!slideFile || !fs.existsSync(slideFile) || index === undefined) {
      return res.status(400).json({ success: false, error: 'Invalid request or no file loaded' });
    }

    try {
      const html = fs.readFileSync(slideFile, 'utf-8');
      const $ = cheerio.load(html);
      const slide = $('.slide').eq(index);
      
      if (slide.length === 0) {
        return res.status(404).json({ success: false, error: 'Slide not found' });
      }

      let notesEl = slide.find('.speaker-notes');
      if (notesEl.length === 0) {
        // Create the hidden speaker notes element if it doesn't exist
        slide.append('\n    <aside class="speaker-notes" style="display: none;"></aside>\n');
        notesEl = slide.find('.speaker-notes');
      }
      
      notesEl.text(text || '');
      
      fs.writeFileSync(slideFile, $.html(), 'utf-8');
      res.json({ success: true });
    } catch (err) {
      console.error('Error saving notes:', err);
      res.status(500).json({ success: false, error: 'Failed to save notes' });
    }
  });

  // GET /network-info - Returns local IP and QR Code
  app.get('/network-info', async (req, res) => {
    let localIp = '127.0.0.1';
    const interfaces = os.networkInterfaces();
    
    // Find the first external IPv4 address
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
      if (localIp !== '127.0.0.1') break;
    }
    
    const audienceUrl = `http://${localIp}:${port}/audience`;
    try {
      const qrDataUrl = await QRCode.toDataURL(audienceUrl, { margin: 2, scale: 6 });
      res.json({ url: audienceUrl, qr: qrDataUrl });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  return { app, server };
}

module.exports = { startServer };
