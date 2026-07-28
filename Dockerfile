FROM node:20-alpine
 
WORKDIR /app
 
COPY package.json package-lock.json* ./
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm cache clean --force && \
    success=0 && \
    for i in 1 2 3 4 5; do \
      echo "=== Install attempt $i ===" && \
      rm -rf node_modules && \
      npm install --omit=dev --no-audit --no-fund; \
      if node -e "require('express'); require('@turbodocx/html-to-docx'); require('node-fetch')" 2>/dev/null; then \
        echo "=== Verified OK on attempt $i ===" && \
        success=1 && \
        break; \
      else \
        echo "=== Attempt $i failed verification ==="; \
      fi; \
    done; \
    if [ "$success" != "1" ]; then echo "All install attempts failed" && exit 1; fi && \
    node -e "require('express'); require('@turbodocx/html-to-docx'); require('node-fetch'); console.log('All dependencies verified OK')"
 
COPY server.js ./
 
ENV PORT=3000
EXPOSE 3000
 
CMD ["node", "server.js"]
 