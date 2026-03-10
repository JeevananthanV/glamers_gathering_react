# Glamour Gatherings Backend

## Setup
1. Create a `.env` file using `.env.example`.
2. Install dependencies:
   - `npm install`
3. Start the server:
   - `npm run dev`

## API
- `POST /api/submissions/audience`
- `POST /api/submissions/models`
- `POST /api/submissions/makeup-artists`
- `POST /api/submissions/stall-owners`
- `POST /api/auth/login`
- `GET /api/admin/overview`
- `GET /api/admin/category/:type` where type is `audience`, `models`, `makeup-artists`, or `stall-owners`
