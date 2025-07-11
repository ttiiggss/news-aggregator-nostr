# Nostr Longform Reader

A modern web application that displays longform content from Nostr relays, specifically targeting posts from Highlighter.com and Habla.news. The application connects to a reliable Nostr relay in the background and provides a clean, responsive interface for reading longform content.

## Features

- 🔗 **Reliable Relay Connection**: Connects to the constant relay (`wss://tigs.nostr1.com`)
- 📱 **Responsive Design**: Works beautifully on desktop, tablet, and mobile devices
- 🎯 **Source Filtering**: Filter content by source (All, Highlighter.com, Habla.news)
- 📅 **Sorting Options**: Sort posts by newest or oldest first
- 🔄 **Real-time Updates**: Refresh button to fetch latest content
- 🌙 **Dark Mode**: Modern dark theme optimized for reading
- 📊 **Relay Status**: Live monitoring of relay connection status
- 🚀 **Fast Performance**: Uses Nostr-tools library for efficient event handling

## Quick Start

### Option 1: Simple HTTP Server (Recommended)

1. **Install dependencies** (if you want to use the npm scripts):
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```
   
   This will start a local server at `http://localhost:3000` and open it in your browser.

### Option 2: Any HTTP Server

Since this is a client-side application, you can serve it with any HTTP server:

```bash
# Using Python 3
python -m http.server 3000

# Using Python 2
python -m SimpleHTTPServer 3000

# Using Node.js http-server globally
npx http-server . -p 3000 -o

# Using PHP
php -S localhost:3000
```

### Option 3: Direct File Access

⚠️ **Not Recommended**: Due to CORS restrictions with ES modules, you cannot simply open `index.html` in your browser. You must use an HTTP server.

## How It Works

### Nostr Integration

The application uses the latest version of [nostr-tools](https://github.com/nbd-wtf/nostr-tools) to:

1. **Generate/Load Identity**: Creates a private key stored in localStorage for background authentication
2. **Connect to Relay**: Connects to the constant relay `wss://tigs.nostr1.com`
3. **Query Longform Content**: Searches for Nostr events of kind `30023` (longform content)
4. **Process and Display**: Parses event metadata, extracts titles, summaries, and content

### Content Sources

The application identifies content sources by examining:
- `client` tags in Nostr events
- Content analysis for platform-specific keywords
- Event metadata and tags

Posts are categorized as:
- **Highlighter.com**: Distinguished by purple branding
- **Habla.news**: Distinguished by cyan branding
- **Unknown**: Other longform content

### Relay Management

- **Connection Status**: Real-time monitoring with visual indicators
- **Automatic Reconnection**: Handles disconnections gracefully
- **Simplified Setup**: Uses single reliable relay for consistent performance

## File Structure

```
nostr-longform-reader/
├── index.html          # Main HTML structure
├── style.css           # Modern CSS styling with dark theme
├── script.js           # Core application logic and Nostr integration
├── package.json        # Dependencies and npm scripts
└── README.md           # This file
```

## Configuration

### Relay Configuration

The application uses a single constant relay `wss://tigs.nostr1.com`. To change this relay, modify the `constantRelay` property in the `NostrLongformReader` class constructor in `script.js`:

```javascript
this.constantRelay = 'wss://your-relay-here.com';
```

This simplified setup ensures reliable connections and reduces complexity while still providing access to longform content from the Nostr network.

## Browser Compatibility

- **Modern Browsers**: Chrome 87+, Firefox 78+, Safari 14+, Edge 88+
- **ES Modules**: Requires browser support for ES6 modules
- **Fetch API**: Uses modern fetch for HTTP requests
- **Local Storage**: Stores private key for persistent identity

## Privacy & Security

- **Local Key Generation**: Private keys are generated locally and stored in browser localStorage
- **No Server**: Pure client-side application, no data sent to external servers except Nostr relays
- **HTTPS Recommended**: Use HTTPS in production for secure WebSocket connections

## Troubleshooting

### No Posts Showing

1. Check the relay connection status in the footer
2. Try clicking the "Refresh" button
3. Open browser developer tools and check the console for error messages
4. Verify your internet connection

### Relay Connection Issues

1. The relay may be temporarily offline
2. Firewall or corporate networks may block WebSocket connections
3. Try refreshing the page to reconnect

### CORS Errors

- Ensure you're running the application through an HTTP server, not opening the file directly
- Use `npm run dev` or any other HTTP server method

## API Reference

### Nostr Event Types

- **Kind 30023**: Longform content events
- **Tags Used**:
  - `title`: Article title
  - `summary`: Article summary
  - `published_at`: Publication timestamp
  - `client`: Publishing client/platform
  - `t`: Topic tags

## Contributing

Feel free to submit issues and enhancement requests! This is a simple, self-contained application that can be easily modified and extended.

## License

MIT License - feel free to use this code for your own projects. #   n e w s - a g g r e g a t o r - n o s t r  
 