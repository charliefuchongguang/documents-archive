# -*- coding: utf-8 -*-
"""把两份招投标政策文件转为 Markdown。
- docx：交通部通知 + 公平竞争合规指引（23 条）
- pdf ：招标人主体责任履行指引（42 条）
        PDF 为逐行硬换行，用 x0 坐标还原段落：连续行 x0≈80.8，新段首行 x0≈110.8，
        “第X条”后的正文首行 x0≈171.8，章标题居中。
输出按“块”组织：标题/段落各一块，条与其下的（一）（二）项合并为一块。
"""
import re
import pymupdf
from docx import Document

BASE = "D:/AI/0、公司内部项目/项目归档工具/notes/"
CN = "一二三四五六七八九十"
RE_CH = rf"^第[{CN}]+章"
RE_AR = rf"^第[{CN}]+条"
RE_IT = rf"^（[{CN}]+）"


def join_blocks(blocks, path):
    text = "\n\n".join(b.rstrip() for b in blocks if b.strip())
    text = re.sub(r"\n{3,}", "\n\n", text)
    open(path, "w", encoding="utf-8").write(text + "\n")
    print("saved", path.split("/")[-1], len(text), "chars")


def add_items(block, items):
    """把（一）（二）… 挂到条后，与条正文之间空一行，项之间紧排"""
    if not items:
        return block
    return block + "\n\n" + "\n".join("- " + x for x in items)


# ---------------- 1. docx ----------------
def conv_docx():
    p = BASE + "2025-交通运输部关于印发《公路工程建设项目资格预审文件和招标文件公平竞争合规指引》的通知（交公路规2025 1号）.docx"
    paras = [x.text.strip() for x in Document(p).paragraphs]
    blocks, items, in_notice = [], [], True

    def flush():
        nonlocal items
        if items and blocks:
            blocks[-1] = add_items(blocks[-1], items)
        items = []

    for t in paras:
        if not t:
            continue
        if t.startswith("公路工程建设项目资格预审文件和招标文件公平竞争合规指引"):
            flush()
            blocks += ["---", f"# {t}"]
            in_notice = False
            continue
        if re.match(RE_CH, t):
            flush()
            blocks.append("## " + re.sub(r"\s+", "　", t))
            in_notice = False
            continue
        if re.match(RE_AR, t):
            flush()
            m = re.match(rf"^(第[{CN}]+条)[　\s]*(.*)$", t)
            blocks.append(f"**{m.group(1)}**　{m.group(2)}")
            in_notice = False
            continue
        if re.match(RE_IT, t):
            items.append(t)
            continue
        flush()
        if in_notice:
            if t.startswith("交通运输部关于印发"):
                blocks.append(f"# {t}")
            elif t.startswith("（交公路规"):
                blocks.append(f"> {t}　｜　2025 年 3 月 28 日　｜　此件公开发布")
            elif t == "（此件公开发布）":
                continue
            elif t == "交通运输部":
                blocks.append(f"**{t}**")
            else:
                blocks.append(t)
        else:
            blocks.append(t)
    flush()
    return blocks


# ---------------- 2. pdf ----------------
def pdf_paragraphs(path):
    """按 x0 还原段落"""
    paras, cur = [], None
    for pg in pymupdf.open(path):
        for b in pg.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for l in b["lines"]:
                txt = "".join(s["text"] for s in l["spans"]).strip()
                if not txt or re.fullmatch(r"—\s*\d+\s*—", txt):
                    continue
                x0 = l["bbox"][0]
                if x0 >= 105:            # 段首（缩进 2 字）或居中标题
                    if cur:
                        paras.append(cur)
                    cur = txt
                else:                     # 续行
                    cur = (cur or "") + txt
    if cur:
        paras.append(cur)
    return paras


def conv_pdf():
    path = BASE + "2025-招标人主体责任履行指引（发改法规2025 1358号）.pdf"
    paras = pdf_paragraphs(path)

    # 合并“第X章”与其标题行
    merged = []
    for t in paras:
        if merged and re.fullmatch(rf"第[{CN}]+章", merged[-1]) and len(t) <= 8 \
                and not re.match(RE_AR, t) and not re.match(RE_IT, t):
            merged[-1] = merged[-1] + "　" + t
        else:
            merged.append(t)

    # “第X条”单独成行时，与紧随其后的正文合为一段
    for i in range(len(merged) - 1):
        if re.fullmatch(rf"第[{CN}]+条", merged[i]) and merged[i + 1]:
            merged[i] = merged[i] + merged[i + 1]
            merged[i + 1] = ""
    merged = [x for x in merged if x]

    blocks, items = ["# 招标人主体责任履行指引",
                     "> 发改法规〔2025〕1358 号　｜　自 2026 年 1 月 1 日起实施　｜　共 8 章 42 条",
                     "---"], []

    def flush():
        nonlocal items
        if items and blocks:
            blocks[-1] = add_items(blocks[-1], items)
        items = []

    for t in merged:
        if t == "招标人主体责任履行指引":   # 正文标题，已作 H1
            continue
        t = re.sub(r"(?<=[0-9])\s+(?=[年第月日号条项])", "", t)  # “2018 年第16 号”
        if re.match(RE_CH, t):
            flush()
            blocks.append("## " + t)
            continue
        if re.match(RE_AR, t):
            flush()
            m = re.match(rf"^(第[{CN}]+条)[　\s]*(.*)$", t)
            blocks.append(f"**{m.group(1)}**　{m.group(2)}")
            continue
        if re.match(RE_IT, t):
            items.append(t)
            continue
        flush()
        blocks.append(t)
    flush()
    return blocks


join_blocks(conv_docx(), BASE + "2025-交公路规2025-1号 公路工程建设项目资格预审文件和招标文件公平竞争合规指引.md")
join_blocks(conv_pdf(), BASE + "2025-发改法规2025-1358号 招标人主体责任履行指引.md")
