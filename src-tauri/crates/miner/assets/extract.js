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

    // 2. 移除干扰元素（增强版）
    const noiseSelectors = [
        // 广告
        '.ad', '.ads', '.advertisement', '.ad-container', '.ad-banner',
        '[class*="ad-"]', '[id*="ad-"]',

        // Cookie 横幅
        '.cookie-banner', '.cookie-notice', '.cookie-consent',
        '#cookie-notice', '[class*="cookie"]',

        // 弹窗
        '.modal', '.popup', '.overlay', '.newsletter-modal',
        '.subscribe-popup', '.email-signup',

        // 导航和页脚
        'nav', 'footer', 'aside', '.sidebar', '.navigation',
        '.header', '.site-header', '.site-footer',

        // 社交分享
        '.social-share', '.share-buttons', '.social-links',

        // 评论区
        '.comments', '.comment-section', '#disqus_thread',

        // 其他
        'iframe', 'script', 'noscript', 'style',
        '.related-posts', '.recommended', '.trending'
    ];

    document.querySelectorAll(noiseSelectors.join(',')).forEach(el => {
        try {
            el.remove();
        } catch(e) {
            // 某些元素可能无法删除，忽略错误
        }
    });

    // 3. 提取代码块语言（增强版）
    document.querySelectorAll('pre, code').forEach(el => {
        // 多种方式检测语言
        let language = '';

        // 方法1: class 属性中的 language-* 或 lang-*
        if (el.className) {
            let match = el.className.match(/(?:language|lang)-([a-z0-9\-]+)/i);
            if (match) {
                language = match[1];
            }
        }

        // 方法2: data-language 属性
        if (!language && el.getAttribute('data-language')) {
            language = el.getAttribute('data-language');
        }

        // 方法3: data-lang 属性
        if (!language && el.getAttribute('data-lang')) {
            language = el.getAttribute('data-lang');
        }

        // 保存检测到的语言
        if (language) {
            el.setAttribute('data-language', language);
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

    // 5. Turndown（增强版）
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

    // 增强的代码块规则
    turndownService.addRule('fencedCodeBlock', {
        filter: function (node) {
            return node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
        },
        replacement: function (content, node) {
            var codeNode = node.firstChild;

            // 1. 多种方式检测语言
            var language = '';

            // 方法1: data-language 属性（我们之前设置的）
            language = codeNode.getAttribute('data-language') || '';

            // 方法2: class 属性
            if (!language) {
                var className = codeNode.className || node.className || '';
                var match = className.match(/(?:language|lang)-([a-z0-9\-]+)/i);
                if (match) language = match[1];
            }

            // 方法3: data-lang 属性
            if (!language) {
                language = codeNode.getAttribute('data-lang') ||
                          node.getAttribute('data-lang') || '';
            }

            // 2. 提取纯文本（避免嵌套 HTML）
            var cleanText = codeNode.textContent || codeNode.innerText || '';
            cleanText = cleanText.trim();

            // 3. 计算围栏字符（避免冲突）
            var fence = '```';
            if (cleanText.includes('```')) {
                fence = '````';
                if (cleanText.includes('````')) {
                    fence = '`````';
                }
            }

            return '\n\n' + fence + language + '\n' + cleanText + '\n' + fence + '\n\n';
        }
    });

    // 添加内联代码规则
    turndownService.addRule('inlineCode', {
        filter: function(node) {
            // 排除 <pre> 内的 <code>
            var isCode = node.nodeName === 'CODE';
            var notInPre = !node.closest || !node.closest('pre');
            return isCode && notInPre;
        },
        replacement: function(content, node) {
            var code = (node.textContent || '').trim();

            // 智能选择围栏
            var fence = '`';
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
