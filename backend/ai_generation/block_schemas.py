"""
Complete block schemas for AI generation.
Defines valid block types, required data fields, and validation rules.
Used both for the LLM system prompt and for validating generated output.
"""

# Maps block type -> { "fields": { field_name: field_spec }, "description": str }
# field_spec: { "type": str, "required": bool, "max_length": int|None, "options": list|None, "default": any }

BLOCK_SCHEMAS = {
    "navbar": {
        "description": "Navigation bar with brand name, links, and CTA button. Should be the first block.",
        "fields": {
            "brandName": {"type": "string", "required": True, "max_length": 50},
            "logoImage": {"type": "string", "required": False, "default": ""},
            "link1": {"type": "string", "required": True, "max_length": 30},
            "link2": {"type": "string", "required": True, "max_length": 30},
            "link3": {"type": "string", "required": True, "max_length": 30},
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
        "description": "Grid showing 2 key features with titles and descriptions.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "feature1Title": {"type": "string", "required": True, "max_length": 60},
            "feature1Desc": {"type": "string", "required": True, "max_length": 200},
            "feature2Title": {"type": "string", "required": True, "max_length": 60},
            "feature2Desc": {"type": "string", "required": True, "max_length": 200},
        },
    },
    "testimonials": {
        "description": "Section with 2 customer testimonials including quotes, names, and roles.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "quote1": {"type": "string", "required": True, "max_length": 300},
            "author1": {"type": "string", "required": True, "max_length": 50},
            "role1": {"type": "string", "required": True, "max_length": 60},
            "quote2": {"type": "string", "required": True, "max_length": 300},
            "author2": {"type": "string", "required": True, "max_length": 50},
            "role2": {"type": "string", "required": True, "max_length": 60},
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
            "link1Label": {"type": "string", "required": True, "max_length": 30},
            "link2Label": {"type": "string", "required": True, "max_length": 30},
            "link3Label": {"type": "string", "required": True, "max_length": 30},
        },
    },
    "pricing": {
        "description": "Pricing section with 2 plans. Each plan has name, price, features (newline-separated), and a button.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "plan1Name": {"type": "string", "required": True, "max_length": 30},
            "plan1Price": {"type": "string", "required": True, "max_length": 20},
            "plan1Features": {"type": "string", "required": True, "max_length": 500},
            "plan1ButtonText": {"type": "string", "required": True, "max_length": 30},
            "plan2Name": {"type": "string", "required": True, "max_length": 30},
            "plan2Price": {"type": "string", "required": True, "max_length": 20},
            "plan2Features": {"type": "string", "required": True, "max_length": 500},
            "plan2ButtonText": {"type": "string", "required": True, "max_length": 30},
            "plan2Highlighted": {"type": "boolean", "required": False, "default": True},
        },
    },
    "faq": {
        "description": "FAQ section with 3 questions and answers.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "q1": {"type": "string", "required": True, "max_length": 150},
            "a1": {"type": "string", "required": True, "max_length": 500},
            "q2": {"type": "string", "required": True, "max_length": 150},
            "a2": {"type": "string", "required": True, "max_length": 500},
            "q3": {"type": "string", "required": True, "max_length": 150},
            "a3": {"type": "string", "required": True, "max_length": 500},
        },
    },
    "logoCloud": {
        "description": "Logo cloud showing names of 5 partner/client companies.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "logo1": {"type": "string", "required": True, "max_length": 40},
            "logo2": {"type": "string", "required": True, "max_length": 40},
            "logo3": {"type": "string", "required": True, "max_length": 40},
            "logo4": {"type": "string", "required": True, "max_length": 40},
            "logo5": {"type": "string", "required": True, "max_length": 40},
        },
    },
    "gallery": {
        "description": "Image gallery section with title, subtitle, and column layout. Images are left empty (user uploads later).",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "columns": {"type": "string", "required": False, "options": ["2", "3", "4"], "default": "3"},
            "image1": {"type": "string", "required": False, "default": ""},
            "image2": {"type": "string", "required": False, "default": ""},
            "image3": {"type": "string", "required": False, "default": ""},
            "image4": {"type": "string", "required": False, "default": ""},
            "image5": {"type": "string", "required": False, "default": ""},
            "image6": {"type": "string", "required": False, "default": ""},
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
        "description": "Team section showing 3 members with names, roles, and optional photos.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "member1Name": {"type": "string", "required": True, "max_length": 50},
            "member1Role": {"type": "string", "required": True, "max_length": 60},
            "member1Image": {"type": "string", "required": False, "default": ""},
            "member2Name": {"type": "string", "required": True, "max_length": 50},
            "member2Role": {"type": "string", "required": True, "max_length": 60},
            "member2Image": {"type": "string", "required": False, "default": ""},
            "member3Name": {"type": "string", "required": True, "max_length": 50},
            "member3Role": {"type": "string", "required": True, "max_length": 60},
            "member3Image": {"type": "string", "required": False, "default": ""},
        },
    },
    "stats": {
        "description": "Statistics section with 4 key metrics (value + label).",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "subtitle": {"type": "string", "required": False, "max_length": 200, "default": ""},
            "stat1Value": {"type": "string", "required": True, "max_length": 20},
            "stat1Label": {"type": "string", "required": True, "max_length": 40},
            "stat2Value": {"type": "string", "required": True, "max_length": 20},
            "stat2Label": {"type": "string", "required": True, "max_length": 40},
            "stat3Value": {"type": "string", "required": True, "max_length": 20},
            "stat3Label": {"type": "string", "required": True, "max_length": 40},
            "stat4Value": {"type": "string", "required": True, "max_length": 20},
            "stat4Label": {"type": "string", "required": True, "max_length": 40},
        },
    },
    "timeline": {
        "description": "Timeline section with 3 chronological events.",
        "fields": {
            "title": {"type": "string", "required": True, "max_length": 80},
            "item1Date": {"type": "string", "required": True, "max_length": 30},
            "item1Title": {"type": "string", "required": True, "max_length": 60},
            "item1Desc": {"type": "string", "required": True, "max_length": 200},
            "item2Date": {"type": "string", "required": True, "max_length": 30},
            "item2Title": {"type": "string", "required": True, "max_length": 60},
            "item2Desc": {"type": "string", "required": True, "max_length": 200},
            "item3Date": {"type": "string", "required": True, "max_length": 30},
            "item3Title": {"type": "string", "required": True, "max_length": 60},
            "item3Desc": {"type": "string", "required": True, "max_length": 200},
        },
    },
}

VALID_BLOCK_TYPES = set(BLOCK_SCHEMAS.keys())


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
            req = '(required)' if fspec.get('required') else '(optional)'
            ftype = fspec['type']
            constraint = ''
            if 'max_length' in fspec:
                constraint = f', max {fspec["max_length"]} chars'
            if 'options' in fspec:
                constraint += f', one of: {fspec["options"]}'
            if 'default' in fspec:
                default_val = fspec['default']
                if isinstance(default_val, str):
                    constraint += f', default: "{default_val}"'
                else:
                    constraint += f', default: {default_val}'
            field_lines.append(f'    "{fname}": "{ftype} {req}{constraint}"')
        lines.append(',\n'.join(field_lines))
        lines.append('  }')
        lines.append('}')
        lines.append('```')
        lines.append('')
    return '\n'.join(lines)
