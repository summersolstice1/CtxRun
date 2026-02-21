// src-tauri/crates/miner/assets/extract.js

async function executeCtxRunExtraction() {
    const baseUri = document.baseURI || window.location.href;

    // 1. URL 绝对化
    document.querySelectorAll('a, img, source').forEach(el => {
        try {
            if (el.tagName === 'A' && el.getAttribute('href') && !el.getAttribute('href').startsWith('#') && !el.href.startsWith('http')) {
                el.href = new URL(el.getAttribute('href'), baseUri).href;
            }
            if (el.tagName === 'IMG' && el.getAttribute('src') && !el.src.startsWith('http') && !el.src.startsWith('data:')) {
                el.src = new URL(el.getAttribute('src'), baseUri).href;
            }
        } catch(e) {}
    });

    // 2. 移除干扰元素
    const noiseSelectors = ['.cookie-banner', '#cookie-notice', '.ad-container', 'iframe', '.newsletter-modal', 'nav', 'footer', 'aside', '.sidebar'];
    document.querySelectorAll(noiseSelectors.join(',')).forEach(el => el.remove());

    // 3. 提取代码块语言
    document.querySelectorAll('pre, code').forEach(el => {
        let match = el.className ? el.className.match(/language-([a-z0-9\-]+)/i) : null;
        if (match) {
            el.setAttribute('data-language', match[1]);
        }
    });

    // 4. 克隆文档
    var documentClone = document.cloneNode(true);

    if (typeof Readability === 'undefined') {
        return JSON.stringify({ error: "Readability is not defined in scope" });
    }

    var article = new Readability(documentClone).parse();

    if (!article || !article.content) {
        return JSON.stringify({ error: "Readability failed to extract article" });
    }

    // 5. Turndown
    if (typeof TurndownService === 'undefined') {
        return JSON.stringify({ error: "TurndownService is not defined in scope" });
    }

    var turndownService = new TurndownService({
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
        replacement: function (content, node) {
            var className = node.firstChild.getAttribute('data-language') || node.firstChild.className || node.className || '';
            var language = (className.match(/language-([a-z0-9\-]+)/) || [null, ''])[1];
            var cleanText = node.firstChild.textContent.trim();
            return '\n\n```' + language + '\n' + cleanText + '\n```\n\n';
        }
    });

    turndownService.remove(['script', 'noscript', 'style', 'button']);

    var markdown = turndownService.turndown(article.content);

    // 6. 提取本域链接
    const currentOrigin = window.location.origin;
    const links = Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(href => href && href.startsWith(currentOrigin) && !href.includes('#'));

    const uniqueLinks = [...new Set(links)];

    // 7. 返回序列化后的 JSON 字符串
    return JSON.stringify({
        url: window.location.href,
        title: article.title || document.title || "Untitled",
        markdown: markdown,
        links: uniqueLinks
    });
}
