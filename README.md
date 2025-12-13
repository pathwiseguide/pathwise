# Pathwise

A web application for collecting and exporting questionnaire responses with multi-page support.

## Features

- **Multi-page Questions**: Organize questions across multiple pages
- **Multiple Question Types**: text, email, number, textarea, select, radio, checkbox
- **Response Storage**: All responses stored in JSON files
- **Data Export**: Export all questions and responses via API

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open http://localhost:3000 in your browser

## Deployment

This app can be deployed to various platforms. See deployment instructions below.

## API Endpoints

- `GET /api/questions` - Get all questions
- `POST /api/questions` - Update questions (expects JSON array)
- `POST /api/responses` - Submit a new response
- `GET /api/responses` - Get all responses
- `GET /api/export` - Download export file

## Question Format

Each question should have:
- `id`: Unique identifier
- `text`: Question text
- `type`: Question type (text, email, number, textarea, select, radio, checkbox)
- `page`: Page number (1, 2, 3, etc.)
- `required`: true/false (optional)
- `options`: Array of options (required for select, radio, checkbox)

Example:
```json
[
  {
    "id": "1",
    "text": "What is your name?",
    "type": "text",
    "required": true,
    "page": 1
  }
]
```

