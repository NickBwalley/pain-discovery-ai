import hashlib
import re
from html.parser import HTMLParser


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.blocked = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.blocked += 1
        if tag in ("p", "br", "div", "li"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.blocked = max(0, self.blocked - 1)
        if tag in ("p", "div", "li"):
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.blocked:
            self.parts.append(data)


def normalize_html(value: str) -> str:
    parser = PlainText()
    parser.feed(value)
    return re.sub(r"\s+", " ", "".join(parser.parts)).strip()[:12000]


def content_hash(text: str) -> str:
    return hashlib.sha256(re.sub(r"\s+", " ", text).strip().casefold().encode()).hexdigest()


def redact_contacts(text: str) -> str:
    text = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[contact redacted]", text, flags=re.I)
    return re.sub(r"(?<!\w)(?:\+?\d[\s().-]*){9,}(?!\w)", "[contact redacted]", text)


def relevant(text: str, project: dict) -> bool:
    haystack = text.casefold()
    if any(word.casefold() in haystack for word in project.get("excludes", []) if word):
        return False
    terms = project.get("keywords", []) + project.get("competitors", []) + project.get("includes", [])
    return any(term.casefold() in haystack for term in terms if term)
