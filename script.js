import { 
    SimplePool, 
    nip19, 
    getPublicKey,
    generateSecretKey,
    relayInit 
} from 'https://unpkg.com/nostr-tools@2.1.0/lib/nostr.bundle.js';

class NostrLongformReader {
    constructor() {
        this.pool = new SimplePool();
        
        // 9 most commonly used relays + your specified relay
        this.relays = [
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.primal.net',
            'wss://relay.snort.social',
            'wss://nostr.wine',
            'wss://relay.nostr.band',
            'wss://nostr-pub.wellorder.net',
            'wss://offchain.pub',
            'wss://relay.current.fyi',
            'wss://tigs.nostr1.com' // Your specified relay
        ];
        
        this.relayConnections = new Map();
        this.connectedRelays = new Set();
        this.posts = [];
        this.filteredPosts = [];
        
        // Generate or load private key for background login
        this.privateKey = this.getOrGeneratePrivateKey();
        this.publicKey = getPublicKey(this.privateKey);
        
        console.log('Nostr keypair generated:', {
            pubkey: nip19.npubEncode(this.publicKey),
            relayCount: this.relays.length
        });
        
        this.init();
    }

    async init() {
        console.log('Initializing Nostr Longform Reader...');
        await this.setupRelays();
        this.setupEventListeners();
        this.updateUI();
        await this.fetchPosts();
    }

    getOrGeneratePrivateKey() {
        let privateKey = localStorage.getItem('nostr-longform-reader-pk');
        if (!privateKey) {
            privateKey = Array.from(generateSecretKey()).map(b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem('nostr-longform-reader-pk', privateKey);
        }
        return new Uint8Array(privateKey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    }

    async setupRelays() {
        console.log('Connecting to relays:', this.relays);
        this.updateRelayStatus();
        
        // Connect to all relays
        const connectionPromises = this.relays.map(async (relayUrl) => {
            try {
                const relay = relayInit(relayUrl);
                this.relayConnections.set(relayUrl, {
                    relay: relay,
                    status: 'connecting',
                    lastConnected: null,
                    errors: 0
                });
                
                relay.on('connect', () => {
                    console.log(`✅ Connected to ${relayUrl}`);
                    this.connectedRelays.add(relayUrl);
                    this.relayConnections.get(relayUrl).status = 'connected';
                    this.relayConnections.get(relayUrl).lastConnected = new Date();
                    this.updateRelayStatus();
                });
                
                relay.on('disconnect', () => {
                    console.log(`❌ Disconnected from ${relayUrl}`);
                    this.connectedRelays.delete(relayUrl);
                    this.relayConnections.get(relayUrl).status = 'disconnected';
                    this.updateRelayStatus();
                });
                
                relay.on('error', (error) => {
                    console.error(`⚠️ Error with ${relayUrl}:`, error);
                    this.connectedRelays.delete(relayUrl);
                    const connection = this.relayConnections.get(relayUrl);
                    connection.status = 'error';
                    connection.errors++;
                    this.updateRelayStatus();
                });
                
                // Connect with timeout
                await Promise.race([
                    relay.connect(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Connection timeout')), 10000)
                    )
                ]);
                
                return relay;
            } catch (error) {
                console.error(`Failed to connect to ${relayUrl}:`, error);
                this.relayConnections.get(relayUrl).status = 'error';
                this.relayConnections.get(relayUrl).errors++;
                return null;
            }
        });
        
        // Wait for all connection attempts
        await Promise.allSettled(connectionPromises);
        console.log(`Connected to ${this.connectedRelays.size}/${this.relays.length} relays`);
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refreshPosts();
        });
        
        // Filters
        document.getElementById('source-filter').addEventListener('change', () => {
            this.applyFilters();
        });
        
        document.getElementById('sort-filter').addEventListener('change', () => {
            this.applyFilters();
        });
    }

    async fetchPosts() {
        console.log('Fetching longform posts...');
        this.showLoading(true);
        
        try {
            const connectedRelayUrls = Array.from(this.connectedRelays);
            if (connectedRelayUrls.length === 0) {
                throw new Error('No connected relays available');
            }
            
            console.log(`Fetching from ${connectedRelayUrls.length} connected relays`);
            
            // Fetch longform content (kind 30023) with multiple filters for better coverage
            const filters = [
                {
                    kinds: [30023], // Longform content
                    limit: 100,
                    since: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60) // Last 30 days
                },
                {
                    kinds: [30023],
                    '#t': ['longform', 'article', 'blog'], // Tagged content
                    limit: 50
                },
                {
                    kinds: [30023],
                    '#p': ['highlighter', 'habla'], // Content mentioning our target platforms
                    limit: 50
                }
            ];
            
            const allEvents = [];
            
            // Fetch from each filter
            for (const filter of filters) {
                try {
                    const events = await this.pool.querySync(connectedRelayUrls, filter);
                    allEvents.push(...events);
                    console.log(`Fetched ${events.length} events with filter:`, filter);
                } catch (error) {
                    console.error('Error with filter:', filter, error);
                }
            }
            
            // Remove duplicates based on event ID
            const uniqueEvents = allEvents.filter((event, index, self) => 
                index === self.findIndex((e) => e.id === event.id)
            );
            
            console.log(`Total unique events: ${uniqueEvents.length}`);
            
            this.posts = this.processEvents(uniqueEvents);
            this.applyFilters();
            
        } catch (error) {
            console.error('Error fetching posts:', error);
            this.showError('Failed to fetch posts. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    processEvents(events) {
        return events
            .filter(event => event.kind === 30023 && event.content && event.content.length > 100) // Ensure it's substantial longform content
            .map(event => {
                const tags = event.tags || [];
                const titleTag = tags.find(tag => tag[0] === 'title');
                const summaryTag = tags.find(tag => tag[0] === 'summary');
                const publishedAtTag = tags.find(tag => tag[0] === 'published_at');
                const clientTag = tags.find(tag => tag[0] === 'client');
                const imageTag = tags.find(tag => tag[0] === 'image');
                const topicTags = tags.filter(tag => tag[0] === 't').map(tag => tag[1]);
                
                // Enhanced source detection
                let source = 'unknown';
                let sourceConfidence = 0;
                
                // Check client tag first
                if (clientTag && clientTag[1]) {
                    const client = clientTag[1].toLowerCase();
                    if (client.includes('highlighter')) {
                        source = 'highlighter';
                        sourceConfidence = 0.9;
                    } else if (client.includes('habla')) {
                        source = 'habla';
                        sourceConfidence = 0.9;
                    }
                }
                
                // Check content and tags for platform indicators
                if (sourceConfidence < 0.5) {
                    const content = event.content.toLowerCase();
                    const allTagContent = tags.map(tag => tag.join(' ')).join(' ').toLowerCase();
                    
                    const highlighterIndicators = ['highlighter.com', 'highlighter', 'highlight'];
                    const hablaIndicators = ['habla.news', 'habla', 'speak'];
                    
                    let highlighterScore = 0;
                    let hablaScore = 0;
                    
                    highlighterIndicators.forEach(indicator => {
                        if (content.includes(indicator) || allTagContent.includes(indicator)) {
                            highlighterScore++;
                        }
                    });
                    
                    hablaIndicators.forEach(indicator => {
                        if (content.includes(indicator) || allTagContent.includes(indicator)) {
                            hablaScore++;
                        }
                    });
                    
                    if (highlighterScore > hablaScore && highlighterScore > 0) {
                        source = 'highlighter';
                        sourceConfidence = Math.min(0.7, highlighterScore * 0.3);
                    } else if (hablaScore > 0) {
                        source = 'habla';
                        sourceConfidence = Math.min(0.7, hablaScore * 0.3);
                    }
                }
                
                // Get author metadata
                const authorMetadata = this.getAuthorMetadata(event.pubkey);
                
                return {
                    id: event.id,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    title: titleTag ? titleTag[1] : this.extractTitle(event.content),
                    summary: summaryTag ? summaryTag[1] : this.extractSummary(event.content),
                    content: event.content,
                    author: authorMetadata.name || this.formatPubkey(event.pubkey),
                    authorPicture: authorMetadata.picture,
                    publishedAt: publishedAtTag ? new Date(parseInt(publishedAtTag[1]) * 1000) : new Date(event.created_at * 1000),
                    tags: topicTags,
                    source: source,
                    sourceConfidence: sourceConfidence,
                    wordCount: this.countWords(event.content),
                    image: imageTag ? imageTag[1] : null,
                    readTime: Math.ceil(this.countWords(event.content) / 200) // Average reading speed
                };
            })
            .sort((a, b) => b.publishedAt - a.publishedAt); // Sort by newest first
    }

    extractTitle(content, maxLength = 60) {
        // Look for markdown headers first
        const headerMatch = content.match(/^#{1,3}\s+(.+)/m);
        if (headerMatch) {
            return headerMatch[1].trim().substring(0, maxLength);
        }
        
        // Look for first line that seems like a title
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        if (lines.length > 0) {
            const firstLine = lines[0].trim();
            if (firstLine.length < maxLength * 2 && !firstLine.includes('.') && firstLine.length > 5) {
                return firstLine.substring(0, maxLength);
            }
        }
        
        // Fallback to first sentence
        const firstSentence = content.split(/[.!?]/)[0].trim();
        return firstSentence.substring(0, maxLength) + (firstSentence.length > maxLength ? '...' : '');
    }

    extractSummary(content, maxLength = 200) {
        // Remove markdown and get plain text
        const plainText = content
            .replace(/#{1,6}\s+/g, '') // Remove markdown headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links, keep text
            .replace(/`(.*?)`/g, '$1') // Remove code formatting
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/\n+/g, ' ') // Replace newlines with spaces
            .trim();
        
        if (plainText.length <= maxLength) {
            return plainText;
        }
        
        // Try to end at a sentence boundary
        const truncated = plainText.substring(0, maxLength);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?')
        );
        
        if (lastSentenceEnd > maxLength * 0.7) {
            return truncated.substring(0, lastSentenceEnd + 1);
        }
        
        return truncated.trim() + '...';
    }

    getAuthorMetadata(pubkey) {
        // In a real implementation, you'd cache and fetch user metadata
        // For now, return basic info
        return {
            name: null,
            picture: null
        };
    }

    formatPubkey(pubkey) {
        try {
            const npub = nip19.npubEncode(pubkey);
            return npub.substring(0, 12) + '...' + npub.substring(npub.length - 6);
        } catch (error) {
            return pubkey.substring(0, 12) + '...';
        }
    }

    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    applyFilters() {
        const sourceFilter = document.getElementById('source-filter').value;
        const sortFilter = document.getElementById('sort-filter').value;
        
        let filtered = [...this.posts];
        
        // Apply source filter
        if (sourceFilter !== 'all') {
            filtered = filtered.filter(post => post.source === sourceFilter);
        }
        
        // Apply sort filter
        if (sortFilter === 'oldest') {
            filtered.sort((a, b) => a.publishedAt - b.publishedAt);
        } else {
            filtered.sort((a, b) => b.publishedAt - b.publishedAt);
        }
        
        this.filteredPosts = filtered;
        this.renderPosts();
        this.updateFooterStats();
    }

    renderPosts() {
        const container = document.getElementById('posts-container');
        const noPosts = document.getElementById('no-posts');
        
        if (this.filteredPosts.length === 0) {
            container.style.display = 'none';
            noPosts.style.display = 'block';
            return;
        }
        
        container.style.display = 'grid';
        noPosts.style.display = 'none';
        
        container.innerHTML = this.filteredPosts.map(post => this.createPostCard(post)).join('');
    }

    createPostCard(post) {
        const relativeTime = this.getRelativeTime(post.publishedAt);
        const sourceClass = post.source === 'highlighter' ? 'highlighter' : 
                           post.source === 'habla' ? 'habla' : 'unknown';
        const sourceName = post.source === 'highlighter' ? 'Highlighter.com' :
                          post.source === 'habla' ? 'Habla.news' : 'Unknown Source';
        
        return `
            <article class="post-card" onclick="window.open('https://njump.me/${post.id}', '_blank')">
                <div class="post-header">
                    <div class="post-meta">
                        <div class="post-author">${this.escapeHtml(post.author)}</div>
                        <div class="post-date">${relativeTime}</div>
                    </div>
                    <div class="post-source ${sourceClass}">${sourceName}</div>
                </div>
                
                <h2 class="post-title">${this.escapeHtml(post.title)}</h2>
                
                ${post.summary ? `<p class="post-summary">${this.escapeHtml(post.summary)}</p>` : ''}
                
                ${post.tags.length > 0 ? `
                    <div class="post-tags">
                        ${post.tags.slice(0, 5).map(tag => `<span class="post-tag">#${this.escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
                
                <div class="post-stats">
                    <div class="post-stat">
                        <i class="fas fa-file-alt"></i>
                        <span>${post.wordCount.toLocaleString()} words</span>
                    </div>
                    <div class="post-stat">
                        <i class="fas fa-clock"></i>
                        <span>${post.readTime} min read</span>
                    </div>
                    <div class="post-stat">
                        <i class="fas fa-calendar"></i>
                        <span>${post.publishedAt.toLocaleDateString()}</span>
                    </div>
                </div>
            </article>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getRelativeTime(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        
        return date.toLocaleDateString();
    }

    updateRelayStatus() {
        const statusEl = document.getElementById('relay-status');
        const relayCountEl = document.getElementById('relay-count');
        const relayDetailsEl = document.getElementById('relay-details');
        
        const connectedCount = this.connectedRelays.size;
        const totalCount = this.relays.length;
        
        // Update main status
        if (connectedCount === 0) {
            statusEl.className = 'status-indicator disconnected';
            statusEl.innerHTML = '<i class="fas fa-circle"></i><span>Disconnected</span>';
        } else if (connectedCount < totalCount) {
            statusEl.className = 'status-indicator connecting';
            statusEl.innerHTML = '<i class="fas fa-circle"></i><span>Partial Connection</span>';
        } else {
            statusEl.className = 'status-indicator connected';
            statusEl.innerHTML = '<i class="fas fa-circle"></i><span>Connected</span>';
        }
        
        // Update relay count
        relayCountEl.textContent = `${connectedCount}/${totalCount}`;
        
        // Update relay details for tooltip
        relayDetailsEl.innerHTML = this.relays.map(relayUrl => {
            const connection = this.relayConnections.get(relayUrl);
            const status = connection ? connection.status : 'unknown';
            const isConnected = this.connectedRelays.has(relayUrl);
            
            return `
                <div class="relay-detail-item">
                    <div class="relay-detail-url" title="${relayUrl}">
                        ${relayUrl.replace('wss://', '')}
                    </div>
                    <div class="relay-detail-status ${status}">
                        <i class="fas fa-circle"></i>
                        <span>${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        this.updateFooterStats();
    }

    updateFooterStats() {
        const totalPostsEl = document.getElementById('total-posts');
        const connectedRelaysEl = document.getElementById('connected-relays');
        
        if (totalPostsEl) {
            totalPostsEl.textContent = this.posts.length.toLocaleString();
        }
        
        if (connectedRelaysEl) {
            connectedRelaysEl.textContent = this.connectedRelays.size;
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const postsContainer = document.getElementById('posts-container');
        const noPosts = document.getElementById('no-posts');
        
        if (show) {
            loading.style.display = 'flex';
            postsContainer.style.display = 'none';
            noPosts.style.display = 'none';
        } else {
            loading.style.display = 'none';
        }
    }

    showError(message) {
        console.error(message);
        
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--error-color);
            color: white;
            padding: 1rem;
            border-radius: 0.5rem;
            z-index: 1000;
            max-width: 300px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 5000);
    }

    async refreshPosts() {
        const refreshBtn = document.getElementById('refresh-btn');
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
        
        try {
            await this.fetchPosts();
        } finally {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
        }
    }

    updateUI() {
        this.updateRelayStatus();
        this.updateFooterStats();
        console.log('UI updated');
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NostrLongformReader();
}); 