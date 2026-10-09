"""
Complete block schemas for AI generation.
Defines valid block types, required data fields, and validation rules.
Used both for the LLM system prompt and for validating generated output.
"""

# Maps block type -> { "fields": { field_name: field_spec }, "description": str }
# field_spec: { "type": str, "required": bool, "max_length": int|None, "options": list|None, "default": any }
#
# A list field has type "list" and, instead of max_length, "min_items", "max_items" and
# "items" (the field specs of one item, same format as above). Lists must match the block
# data shapes the editor stores (see pages/block_validators.py). These schemas only drive
# the prompt and a first check of the model output; what is saved goes through
# pages.block_validators.clean_block_data, the same path as the REST API.


def _str(max_length, *, required=True, default=None):
    spec = {"type": "string", "required": required, "max_length": max_length}
    if default is not None:
        spec["default"] = default
    return spec


def _list(description, items, *, min_items, max_items):
    return {
        "type": "list",
        "required": True,
        "description": description,
        "min_items": min_items,
        "max_items": max_items,
        "items": items,
    }


# Navbar and footer share the same menu item shape
MENU_LINK_ITEMS = {
    "label": _str(30),
    "url": _str(200, required=False, default=""),
}

BLOCK_SCHEMAS = {
    "navbar": {
        "description": "Navigation bar with brand name, links, and CTA button. Should be the first block.",
        "fields": {
            "brandName": {"type": "string", "required": True, "max_length": 50},
            "logoImage": {"type": "string", "required": False, "default": ""},
            "links": _list(
                "Menu links; url is an in-page anchor such as #features, or empty",
                MENU_LINK_ITEMS, min_items=3, max_items=5,
            ),
            "ctaText": {"type": "string", "required": True, "max_length": 30},
        },
    },
    "hero": {
        "description": "Large hero section with title, subtitle, CTA button, and optional background image. The main attention-grabbing section.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": True, "max_length": 200},
            "buttonText": {"type": "string", "required": True, "max_length": 30},
            "backgroundImage": {"type": "string", "required": False, "default": ""},
            "alignment": {"type": "string", "required": False, "options": ["center", "left"], "default": "center"},
        },
    },
    "features": {
        "description": "Grid showing 3 to 6 key features with titles and descriptions.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "features": _list("The features", {
                "title": _str(60),
                "description": _str(200),
            }, min_items=3, max_items=6),
        },
    },
    "testimonials": {
        "description": "Section with 2 to 4 customer testimonials including quotes, names, and roles.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "testimonials": _list("The testimonials", {
                "quote": _str(300),
                "author": _str(50),
                "role": _str(60),
            }, min_items=2, max_items=4),
        },
    },
    "cta": {
        "description": "Call-to-action section with title, subtitle, and button.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "buttonText": {"type": "string", "required": True, "max_length": 30},
        },
    },
    "footer": {
        "description": "Page footer with brand, description, navigation links, and copyright. Should be the last block.",
        "fields": {
            "brandName": {"type": "string", "required": True, "max_length": 50},
            "description": {"type": "string", "required": True, "max_length": 200},
            "copyright": {"type": "string", "required": True, "max_length": 100},
            "links": _list(
                "Footer links; url is an in-page anchor such as #pricing, or empty",
                MENU_LINK_ITEMS, min_items=2, max_items=5,
            ),
        },
    },
    "pricing": {
        "description": "Pricing section with 2 to 3 plans. Each plan has name, price, features (newline-separated), and a button. Highlight at most one plan.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "plans": _list("The plans", {
                "name": _str(30),
                "price": _str(20),
                "features": _str(500),
                "buttonText": _str(30),
                "highlighted": {"type": "boolean", "required": False, "default": False},
            }, min_items=2, max_items=3),
        },
    },
    "faq": {
        "description": "FAQ section with 3 to 6 questions and answers.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "questions": _list("The questions", {
                "question": _str(150),
                "answer": _str(500),
            }, min_items=3, max_items=6),
        },
    },
    "logoCloud": {
        "description": "Logo cloud showing names of 4 to 8 partner/client companies.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "logos": _list("The company names", {"name": _str(40)}, min_items=4, max_items=8),
        },
    },
    "gallery": {
        "description": "Image gallery section with title, subtitle, and column layout. Image sources are left empty (user uploads later); give 2 x columns items.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "columns": {"type": "string", "required": False, "options": ["2", "3", "4"], "default": "3"},
            "images": _list("The image slots; src is always empty", {
                "src": {"type": "string", "required": False, "default": ""},
                "alt": _str(100, required=False, default=""),
            }, min_items=4, max_items=8),
        },
    },
    "contact": {
        "description": "Contact form section with title, subtitle, and submit button text.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "buttonText": {"type": "string", "required": True, "max_length": 30},
        },
    },
    "team": {
        "description": "Team section showing 3 to 6 members with names, roles, and optional photos.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "members": _list("The team members", {
                "name": _str(50),
                "role": _str(60),
                "image": {"type": "string", "required": False, "default": ""},
            }, min_items=3, max_items=6),
        },
    },
    "stats": {
        "description": "Statistics section with 3 to 4 key metrics (value + label).",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "stats": _list("The metrics", {
                "value": _str(20),
                "label": _str(40),
            }, min_items=3, max_items=4),
        },
    },
    "timeline": {
        "description": "Timeline section with 3 to 6 chronological events.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "events": _list("The events, oldest first", {
                "date": _str(30),
                "title": _str(60),
                "description": _str(200),
            }, min_items=3, max_items=6),
        },
    },
}

VALID_BLOCK_TYPES = set(BLOCK_SCHEMAS.keys())


def _field_hint(fspec: dict) -> str:
    req = '(required)' if fspec.get('required') else '(optional)'
    hint = f'{fspec["type"]} {req}'
    if 'max_length' in fspec:
        hint += f', max {fspec["max_length"]} chars'
    if 'options' in fspec:
        hint += f', one of: {fspec["options"]}'
    if 'default' in fspec:
        default_val = fspec['default']
        if isinstance(default_val, str):
            hint += f', default: "{default_val}"'
        else:
            hint += f', default: {default_val}'
    return hint


def build_schema_reference() -> str:
    """Build a formatted schema reference string for the LLM system prompt."""
    lines = []
    for btype, schema in BLOCK_SCHEMAS.items():
        lines.append(f'### {btype}')
        lines.append(f'{schema["description"]}')
        lines.append('```json')
        lines.append('{')
        lines.append(f'  "type": "{btype}",')
        lines.append('  "data": {')
        field_lines = []
        for fname, fspec in schema['fields'].items():
            if fspec['type'] == 'list':
                item_lines = ',\n'.join(
                    f'        "{iname}": "{_field_hint(ispec)}"'
                    for iname, ispec in fspec['items'].items()
                )
                field_lines.append(
                    f'    "{fname}": [  // array of objects, {fspec["min_items"]} to {fspec["max_items"]} items: {fspec["description"]}\n'
                    f'      {{\n{item_lines}\n      }}\n'
                    f'    ]'
                )
            else:
                field_lines.append(f'    "{fname}": "{_field_hint(fspec)}"')
        lines.append(',\n'.join(field_lines))
        lines.append('  }')
        lines.append('}')
        lines.append('```')
        lines.append('')
    return '\n'.join(lines)
