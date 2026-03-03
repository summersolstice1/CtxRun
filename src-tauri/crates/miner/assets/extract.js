// src-tauri/crates/miner/assets/extract.js

function resolveHttpUrl(rawHref, baseUri) {
    if (!rawHref) return null;
    const trimmed = rawHref.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;
    if (
        trimmed.startsWith('javascript:') ||
        trimmed.startsWith('mailto:') ||
        trimmed.startsWith('tel:')
    ) {
        return null;
    }

    try {
        const resolved = new URL(trimmed, baseUri);
        if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
            return null;
        }
        resolved.hash = '';
        return resolved.href;
    } catch (_) {
        return null;
    }
}

function collectDiscoverableLinks(doc, baseUri) {
    const seen = new Set();
    doc.querySelectorAll('a[href]').forEach((anchor) => {
        const normalized = resolveHttpUrl(anchor.getAttribute('href'), baseUri);
        if (normalized) {
            seen.add(normalized);
        }
    });
    return Array.from(seen);
}

function absolutizeResourceUrls(doc, baseUri) {
    doc.querySelectorAll('a[href], img[src], source[src]').forEach((el) => {
        try {
            if (el.tagName === 'A') {
                const href = el.getAttribute('href');
                const normalized = resolveHttpUrl(href, baseUri);
                if (normalized) {
                    el.setAttribute('href', normalized);
                }
            }

            if (el.tagName === 'IMG' || el.tagName === 'SOURCE') {
                const src = el.getAttribute('src');
                if (!src) return;
                const trimmed = src.trim();
                if (!trimmed || trimmed.startsWith('data:')) return;
                const normalized = new URL(trimmed, baseUri).href;
                el.setAttribute('src', normalized);
            }
        } catch (_) {}
    });
}

function annotateCodeLanguages(doc) {
    doc.querySelectorAll('pre, code').forEach((el) => {
        let language = '';

        if (el.className) {
            const match = el.className.match(/(?:language|lang)-([a-z0-9\-]+)/i);
            if (match) {
                language = match[1];
            }
        }

        if (!language && el.getAttribute('data-language')) {
            language = el.getAttribute('data-language');
        }

        if (!language && el.getAttribute('data-lang')) {
            language = el.getAttribute('data-lang');
        }

        if (language) {
            el.setAttribute('data-language', language);
        }
    });
}

function pruneNoiseElements(doc) {
    const noiseSelectors = [
        '.ad', '.ads', '.advertisement', '.ad-container', '.ad-banner',
        '[class*="ad-"]', '[id*="ad-"]',
        '.cookie-banner', '.cookie-notice', '.cookie-consent',
        '#cookie-notice', '[class*="cookie"]',
        '.modal', '.popup', '.overlay', '.newsletter-modal',
        '.subscribe-popup', '.email-signup',
        'nav', 'footer', 'aside', '.sidebar', '.navigation',
        '.header', '.site-header', '.site-footer',
        '.social-share', '.share-buttons', '.social-links',
        '.comments', '.comment-section', '#disqus_thread',
        'iframe', 'script', 'noscript', 'style',
        '.related-posts', '.recommended', '.trending'
    ];

    doc.querySelectorAll(noiseSelectors.join(',')).forEach((el) => {
        try {
            el.remove();
        } catch (_) {}
    });
}

function createTurndownService() {
    if (typeof TurndownService === 'undefined') {
        return null;
    }

    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-'
    });

    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }

    turndownService.addRule('fencedCodeBlock', {
        filter: function (node) {
            return node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
        },
        replacement: function (_content, node) {
            const codeNode = node.firstChild;
            let language = codeNode.getAttribute('data-language') || '';

            if (!language) {
                const className = codeNode.className || node.className || '';
                const match = className.match(/(?:language|lang)-([a-z0-9\-]+)/i);
                if (match) language = match[1];
            }

            if (!language) {
                language = codeNode.getAttribute('data-lang') || node.getAttribute('data-lang') || '';
            }

            let cleanText = codeNode.textContent || codeNode.innerText || '';
            cleanText = cleanText.trim();

            let fence = '```';
            if (cleanText.includes('```')) {
                fence = '````';
                if (cleanText.includes('````')) {
                    fence = '`````';
                }
            }

            return '\n\n' + fence + language + '\n' + cleanText + '\n' + fence + '\n\n';
        }
    });

    turndownService.addRule('inlineCode', {
        filter: function (node) {
            const isCode = node.nodeName === 'CODE';
            const notInPre = !node.closest || !node.closest('pre');
            return isCode && notInPre;
        },
        replacement: function (_content, node) {
            const code = (node.textContent || '').trim();

            let fence = '`';
            if (code.includes('`')) {
                fence = '``';
                if (code.includes('``')) {
                    fence = '```';
                }
            }

            return fence + code + fence;
        }
    });

    turndownService.remove(['script', 'noscript', 'style', 'button']);
    return turndownService;
}

function fallbackMarkdown(doc) {
    const text = (doc.body && (doc.body.innerText || doc.body.textContent) || '').trim();
    if (!text) return '';
    return text + '\n';
}

async function executeCtxRunExtraction() {
    const baseUri = document.baseURI || window.location.href;

    // Best practice: discover links on raw DOM before any content-cleanup transform.
    const discoveredLinks = collectDiscoverableLinks(document, baseUri);

    const documentClone = document.cloneNode(true);
    absolutizeResourceUrls(documentClone, baseUri);
    annotateCodeLanguages(documentClone);
    pruneNoiseElements(documentClone);

    const fallbackTitle = document.title || 'Untitled';
    let extractedTitle = fallbackTitle;
    let contentHtml = '';

    if (typeof Readability !== 'undefined') {
        try {
            const article = new Readability(documentClone).parse();
            if (article && article.content) {
                extractedTitle = article.title || fallbackTitle;
                contentHtml = article.content;
            }
        } catch (_) {}
    }

    if (!contentHtml) {
        contentHtml = documentClone.body ? documentClone.body.innerHTML : '';
    }

    let markdown = '';
    const turndownService = createTurndownService();
    if (turndownService && contentHtml) {
        try {
            markdown = turndownService.turndown(contentHtml);
        } catch (_) {
            markdown = fallbackMarkdown(documentClone);
        }
    } else {
        markdown = fallbackMarkdown(documentClone);
    }

    return JSON.stringify({
        url: window.location.href,
        title: extractedTitle || fallbackTitle,
        markdown: markdown || '',
        links: discoveredLinks
    });
}
