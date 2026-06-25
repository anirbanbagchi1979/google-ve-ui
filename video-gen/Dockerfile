FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Firebase / GCP config baked in at build time (NEXT_PUBLIC_ vars are inlined by Next.js)
ENV NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB7PT54rAXt4STaqiD5Vk-ymkkBz6Tu1n0
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=bagchi-genai-bb.firebaseapp.com
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=bagchi-genai-bb
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=bagchi-genai-bb.firebasestorage.app
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=104454103637
ENV NEXT_PUBLIC_FIREBASE_APP_ID=1:104454103637:web:0f62e1f7e86d0e72b96adc
ENV NEXT_PUBLIC_FIREBASE_FIRESTORE_DB_ID=video-gen-bb
ENV NEXT_PUBLIC_GCP_PROJECT_ID=bagchi-genai-bb
ENV NEXT_PUBLIC_GCS_BUCKET=bagchi-genai-bb.firebasestorage.app

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy static assets
COPY --from=builder /app/public ./public

# Copy the standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
