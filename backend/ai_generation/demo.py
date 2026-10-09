"""
Saved AI responses for the demo (ADR-023).

Each file in demo_fixtures/ is a complete page generated once with the real
pipeline (see the generate_ai_fixtures command): the prompt, its language,
keywords to match free text against, and the blocks. Demo mode serves them
instead of calling a provider, through the same validation and persistence as
a real generation.
"""

import json
import re
import unicodedata
import zlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent / 'demo_fixtures'
LANGUAGES = ('es', 'en')
ORIGIN_GENERATED = 'generated'
ORIGIN_PLACEHOLDER = 'placeholder'
DEFAULT_LANGUAGE = 'es'


@dataclass(frozen=True)
class DemoFixture:
    id: str
    language: str
    prompt: str
    title: dict[str, str]
    keywords: tuple[str, ...]
    blocks: tuple[dict, ...]
    # 'generated': real model output (generate_ai_fixtures); 'placeholder': written by hand
    origin: str = ORIGIN_PLACEHOLDER

    def title_for(self, language: str) -> str:
        return self.title.get(language) or self.title.get(self.language) or self.id


@dataclass(frozen=True)
class FixtureMatch:
    fixture: DemoFixture
    matched: bool  # False: nothing in the text matched and a fallback was chosen


def normalize(text: str) -> str:
    """Lowercase, no accents, single spaces: 'Cafetería' and 'cafeteria' compare equal."""
    decomposed = unicodedata.normalize('NFKD', text.lower())
    stripped = ''.join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', stripped).strip()


@lru_cache(maxsize=1)
def load_fixtures() -> tuple[DemoFixture, ...]:
    fixtures = []
    for path in sorted(FIXTURES_DIR.glob('*.json')):
        raw = json.loads(path.read_text(encoding='utf-8'))
        fixtures.append(DemoFixture(
            id=raw['id'],
            language=raw['language'],
            prompt=raw['prompt'],
            title=raw['title'],
            keywords=tuple(raw['keywords']),
            blocks=tuple(raw['blocks']),
            origin=raw.get('origin', ORIGIN_PLACEHOLDER),
        ))
    return tuple(fixtures)


def fixtures_origin() -> str:
    """'generated' only when every saved page came from the model, so the UI
    never claims AI wrote something a person wrote."""
    fixtures = load_fixtures()
    if fixtures and all(f.origin == ORIGIN_GENERATED for f in fixtures):
        return ORIGIN_GENERATED
    return ORIGIN_PLACEHOLDER


def list_prompts(language: str) -> list[dict]:
    """The suggestions for the prompt input: titled in `language`, those written in it first."""
    ordered = sorted(load_fixtures(), key=lambda f: f.language != language)
    return [
        {'id': f.id, 'title': f.title_for(language), 'prompt': f.prompt, 'language': f.language}
        for f in ordered
    ]


def _keyword_hits(text: str, keywords: tuple[str, ...]) -> int:
    # A keyword matches at the start of a word, so 'restaur' covers restaurante and restaurants
    return sum(
        1 for keyword in keywords
        if re.search(r'\b' + re.escape(normalize(keyword)), text)
    )


def match_fixture(prompt: str, language: str = DEFAULT_LANGUAGE) -> FixtureMatch:
    """Pick the fixture for a free-text prompt. Deterministic.

    The exact text of a suggestion wins. Otherwise the fixture with most keyword
    hits wins (one in the requested language breaks ties, then the id). With no
    hits the choice among the fixtures in the requested language depends only on
    the text.
    """
    fixtures = load_fixtures()
    if not fixtures:
        raise LookupError('There are no saved demo pages.')

    text = normalize(prompt)
    for fixture in fixtures:
        if normalize(fixture.prompt) == text:
            return FixtureMatch(fixture, matched=True)

    ranked = sorted(
        fixtures,
        key=lambda f: (-_keyword_hits(text, f.keywords), f.language != language, f.id),
    )
    if _keyword_hits(text, ranked[0].keywords) > 0:
        return FixtureMatch(ranked[0], matched=True)

    candidates = [f for f in fixtures if f.language == language] or list(fixtures)
    return FixtureMatch(candidates[zlib.crc32(text.encode('utf-8')) % len(candidates)], matched=False)


def block_variants(block_type: str) -> list[dict]:
    """The data of every saved block of this type, in fixture order."""
    return [
        block['data']
        for fixture in load_fixtures()
        for block in fixture.blocks
        if block['type'] == block_type
    ]


def pick_variant(block_type: str, seed: str, exclude: list[dict] | None = None) -> dict | None:
    """A saved block of this type chosen from `seed`, skipping the ones in `exclude`
    (the block as it is now). None when the fixtures have none of this type."""
    skipped = exclude or []
    candidates = [data for data in block_variants(block_type) if data not in skipped]
    if not candidates:
        return None
    return candidates[zlib.crc32(seed.encode('utf-8')) % len(candidates)]
