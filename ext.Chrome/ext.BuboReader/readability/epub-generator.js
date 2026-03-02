
class EPUBGenerator {
    constructor() {
        this.mimeType = 'application/epub+zip';
    }

    /**
     * 生成ePub文件
     * @param {Object} article - 文章对象
     * @param {string} article.title - 文章标题
     * @param {string} article.content - 文章内容HTML
     * @param {string} article.url - 文章URL
     * @param {string} article.site - 来源网站
     * @returns {Blob} - ePub文件的Blob对象
     */
    async generateEPUB(article) {
        try {
            // 创建ePub的基本结构
            const epub = await this.createEPUBStructure(article);
            return epub;
        } catch (error) {
            console.error('生成ePub失败:', error);
            throw error;
        }
    }

    /**
     * 创建ePub文件结构
     */
    async createEPUBStructure(article) {
        const zip = new JSZip();
        
        // 添加mimetype文件（必须是第一个文件，且不压缩）
        zip.file('mimetype', this.mimeType, { compression: 'STORE' });

        // 创建容器文件
        this.addContainerFile(zip);

        // 创建OPF文件（内容清单）
        this.addOPFFile(zip, article);

        // 创建NCX文件（目录）
        this.addNCXFile(zip, article);

        // 创建章节文件
        this.addChapterFile(zip, article);

        // 创建样式文件
        this.addStylesFile(zip);

        // 生成ePub文件
        return await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/epub+zip',
            compression: 'DEFLATE'
        });
    }

    /**
     * 添加容器文件
     */
    addContainerFile(zip) {
        const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`;
        
        zip.file('META-INF/container.xml', container);
    }

    /**
     * 添加OPF文件（内容清单）
     */
    addOPFFile(zip, article) {
        const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="BookId">${this.generateUUID()}</dc:identifier>
        <dc:title>${this.escapeXML(article.title)}</dc:title>
        <dc:language>zh-CN</dc:language>
        <dc:creator>智能阅读助手</dc:creator>
        <dc:publisher>${this.escapeXML(article.site)}</dc:publisher>
        <dc:date>${new Date().toISOString()}</dc:date>
        <meta property="dcterms:modified">${new Date().toISOString().split('.')[0] + 'Z'}</meta>
    </metadata>
    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
        <item id="css" href="styles.css" media-type="text/css"/>
    </manifest>
    <spine toc="ncx">
        <itemref idref="chapter1"/>
    </spine>
</package>`;
        
        zip.file('OEBPS/content.opf', opf);
    }

    /**
     * 添加NCX文件（目录）
     */
    addNCXFile(zip, article) {
        const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="${this.generateUUID()}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle>
        <text>${this.escapeXML(article.title)}</text>
    </docTitle>
    <navMap>
        <navPoint id="navpoint-1" playOrder="1">
            <navLabel>
                <text>${this.escapeXML(article.title)}</text>
            </navLabel>
            <content src="chapter1.xhtml"/>
        </navPoint>
    </navMap>
</ncx>`;
        
        zip.file('OEBPS/toc.ncx', ncx);
    }

    /**
 * 添加章节文件
 */
addChapterFile(zip, article) {
    // 清理HTML内容
    const cleanContent = this.cleanHTMLContent(article.content);
    
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
    <title>${this.escapeXML(article.title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
    <section>
        <h1>${this.escapeXML(article.title)}</h1>
        <p class="source">来源: ${this.escapeXML(article.site)}</p>
        <p class="source">原文链接: <a href="${this.escapeXML(article.url)}">crane Tool</a></p>
        <hr/>
        <div class="content">
            ${cleanContent}
        </div>
    </section>
</body>
</html>`;
    
    zip.file('OEBPS/chapter1.xhtml', chapter);
}

    /**
     * 添加样式文件
     */
    addStylesFile(zip) {
        const css = `body {
    font-family: serif;
    line-height: 1.6;
    margin: 0;
    padding: 20px;
    color: #333;
}

h1 {
    font-size: 1.8em;
    text-align: center;
    margin-bottom: 20px;
    color: #2c3e50;
}

.source {
    font-size: 0.9em;
    color: #7f8c8d;
    text-align: center;
    margin-bottom: 20px;
}

.content {
    font-size: 1em;
}

.content p {
    margin-bottom: 1em;
    text-align: justify;
}

.content img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 10px auto;
}

.content blockquote {
    border-left: 3px solid #3498db;
    margin: 20px 0;
    padding-left: 15px;
    color: #7f8c8d;
    font-style: italic;
}

.content h2 {
    font-size: 1.4em;
    margin: 30px 0 15px 0;
    color: #34495e;
}

.content h3 {
    font-size: 1.2em;
    margin: 25px 0 12px 0;
    color: #34495e;
}

hr {
    border: none;
    border-top: 1px solid #bdc3c7;
    margin: 30px 0;
}`;
        
        zip.file('OEBPS/styles.css', css);
    }

/**
 * 验证XML内容
 */
validateXMLContent(xmlContent) {
    try {
        // 创建XML解析器
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');
        
        // 检查解析错误
        const parseError = xmlDoc.getElementsByTagName('parsererror')[0];
        if (parseError) {
            const errorText = parseError.textContent;
            console.error('XML解析错误:', errorText);
            
            // 提取错误位置信息
            const lineMatch = errorText.match(/line (\d+)/);
            const columnMatch = errorText.match(/column (\d+)/);
            
            if (lineMatch && columnMatch) {
                const line = parseInt(lineMatch[1]);
                const column = parseInt(columnMatch[1]);
                console.error(`错误位置: 第${line}行, 第${column}列`);
                
                // 获取错误行内容
                const lines = xmlContent.split('\n');
                if (lines[line - 1]) {
                    const errorLine = lines[line - 1];
                    console.error('错误行内容:', errorLine);
                    console.error('错误位置上下文:', errorLine.substring(column - 50, column + 50));
                }
            }
            
            return false;
        }
        return true;
    } catch (error) {
        console.error('XML验证失败:', error);
        return false;
    }
}
/**
 * 清理HTML内容，使其符合ePub标准
 */
cleanHTMLContent(html) {
    if (!html) return '';
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 移除脚本和样式标签
    const scripts = tempDiv.querySelectorAll('script, style, link');
    scripts.forEach(el => el.remove());
    
    // 处理所有文本节点
    this.processTextNodesSmart(tempDiv);
    
    // 清理和验证属性
    this.cleanAndValidateAttributes(tempDiv);
    
    // 获取处理后的HTML
    let cleanedHTML = tempDiv.innerHTML;
    
    // 只对剩余的未转义&符号进行转义（不在HTML实体中的&）
    cleanedHTML = this.escapeAmpersandsSmart(cleanedHTML);
    
    return cleanedHTML;
}

/**
 * 智能处理文本节点
 */
processTextNodesSmart(element) {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    while (node = walker.nextNode()) {
        if (node.textContent.trim()) {
            // 只转义文本节点中的XML特殊字符
            node.textContent = this.escapeTextContent(node.textContent);
        }
    }
}

/**
 * 转义文本内容（不破坏HTML结构）
 */
escapeTextContent(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * 清理和验证属性
 */
cleanAndValidateAttributes(element) {
    const allElements = element.querySelectorAll('*');
    allElements.forEach(el => {
        // 移除危险属性
        const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'style'];
        dangerousAttrs.forEach(attr => {
            if (el.hasAttribute(attr)) {
                el.removeAttribute(attr);
            }
        });
        
        // 处理src和href属性中的&符号
        this.fixUrlAttributes(el);
    });
}

/**
 * 修复URL属性中的&符号
 */
fixUrlAttributes(element) {
    const urlAttributes = ['src', 'href'];
    
    urlAttributes.forEach(attr => {
        if (element.hasAttribute(attr)) {
            let url = element.getAttribute(attr);
            if (url && url.includes('&') && !url.includes('&amp;')) {
                // 只转义URL中未转义的&符号
                url = url.replace(/&(?!amp;)/g, '&amp;');
                element.setAttribute(attr, url);
            }
        }
    });
}

/**
 * 智能转义&符号（不破坏已有的HTML实体）
 */
escapeAmpersandsSmart(html) {
    // 使用更精确的正则表达式，避免破坏已有的HTML实体
    return html.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

    /**
     * 生成UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

/**
 * 处理文本节点中的特殊字符
 */
processTextNodes(element) {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    while (node = walker.nextNode()) {
        if (node.textContent.trim()) {
            node.textContent = this.escapeXML(node.textContent);
        }
    }
}

/**
 * 最终的XML转义处理
 */
finalEscapeXML(html) {
    return html
        // 首先处理已经部分转义的情况
        .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#)/g, '&amp;')
        // 然后确保其他特殊字符被转义
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        // 移除控制字符
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * 基础XML转义
 */
escapeXML(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

    /**
     * 发送ePub到miReader设备
     * @param {Blob} epubBlob - ePub文件Blob
     * @param {string} deviceUrl - miReader设备URL
     */
    async sendToMiReader(epubBlob, deviceUrl = 'http://192.168.1.100:8080/upload') {
        try {
            const formData = new FormData();
            const fileName = `smart_reader_${Date.now()}.epub`;
            formData.append('file', epubBlob, fileName);
            formData.append('type', 'epub');

            const response = await fetch(deviceUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`上传失败: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('发送到miReader失败:', error);
            throw error;
        }
    }
}
