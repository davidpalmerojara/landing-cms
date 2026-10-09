"""
Generate the saved demo pages (ai_generation/demo_fixtures/*.json) once, with the real
generation pipeline and the server's Gemini key.

    python manage.py generate_ai_fixtures --env-file /path/to/.env

The key is read from GOOGLE_AI_KEY in that file (or from the settings when the option
is not given) and is never printed, logged or written. Files that already exist are
skipped unless --force is given. The command stops at the first provider failure or
exhausted quota instead of retrying, and never makes more than --max-calls calls
(retries after invalid output included).
"""

import json
import time
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from dotenv import dotenv_values

from ai_generation import providers
from ai_generation.block_schemas import BLOCK_SCHEMAS
from ai_generation.demo import FIXTURES_DIR
from ai_generation.pipeline import InvalidOutputError, ProviderCallError, generate_blocks
from ai_generation.providers import ProviderQuotaError

# The prompts of the demo: id, language, title in both languages, the prompt as a
# user would write it, and keywords (Spanish and English) to match free text against.
FIXTURE_SPECS = [
    {
        'id': 'saas-analytics',
        'language': 'en',
        'title': {'es': 'Herramienta de analítica para SaaS', 'en': 'SaaS analytics tool'},
        'prompt': (
            'Landing page for Pulsebase, a product analytics tool for SaaS teams, with customer logos, '
            'pricing plans and an FAQ'
        ),
        'keywords': [
            'saas', 'analytic', 'analitic', 'software', 'dashboard', 'panel de control', 'startup',
            'metric', 'b2b', 'plataforma', 'platform', 'herramienta', 'tool',
        ],
    },
    {
        'id': 'restaurant',
        'language': 'es',
        'title': {'es': 'Restaurante mediterráneo', 'en': 'Mediterranean restaurant'},
        'prompt': (
            'Landing para Casa Olivar, un restaurante de cocina mediterránea en Valencia, con carta '
            'destacada, opiniones de clientes y formulario de reservas'
        ),
        'keywords': [
            'restaur', 'cocina', 'cuisine', 'carta', 'menu', 'menú', 'comida', 'food', 'cafeteria',
            'cafe', 'bar', 'reserva', 'booking', 'table', 'mesa', 'chef', 'tapas', 'pizzeria',
        ],
    },
    {
        'id': 'design-portfolio',
        'language': 'en',
        'title': {'es': 'Portfolio de diseñadora', 'en': 'Design portfolio'},
        'prompt': (
            'Portfolio for Mara Lindqvist, a freelance brand designer, with a gallery of selected '
            'projects, services, testimonials and a contact form'
        ),
        'keywords': [
            'portfolio', 'portafolio', 'diseñ', 'design', 'freelance', 'autonom', 'creativ', 'creative',
            'ilustra', 'illustrat', 'photograph', 'fotograf', 'branding', 'proyectos', 'projects',
            'artist', 'artista',
        ],
    },
    {
        'id': 'fitness-studio',
        'language': 'es',
        'title': {'es': 'Estudio de entrenamiento', 'en': 'Fitness studio'},
        'prompt': (
            'Página para Pulso Studio, un estudio de entrenamiento funcional en Bilbao, con clases, '
            'equipo de entrenadores, tarifas y formulario de contacto'
        ),
        'keywords': [
            'fitness', 'gimnasio', 'gym', 'entrena', 'training', 'workout', 'yoga', 'pilates', 'crossfit',
            'deporte', 'sport', 'clases', 'classes', 'wellness', 'salud', 'health', 'musculacion',
        ],
    },
    {
        'id': 'app-launch',
        'language': 'en',
        'title': {'es': 'Lanzamiento de app móvil', 'en': 'Mobile app launch'},
        'prompt': (
            'Launch page for Tidyup, a mobile app that helps families plan chores and shared shopping '
            'lists, with features, key numbers and a call to download'
        ),
        'keywords': [
            'app', 'aplicacion', 'application', 'movil', 'mobile', 'ios', 'android', 'iphone',
            'descarga', 'download', 'lanzamiento', 'launch', 'smartphone', 'play store', 'app store',
        ],
    },
    {
        'id': 'nonprofit',
        'language': 'es',
        'title': {'es': 'Asociación sin ánimo de lucro', 'en': 'Non-profit organization'},
        'prompt': (
            'Web para Manos al Campo, una asociación sin ánimo de lucro que recupera huertos urbanos, '
            'con misión, impacto en cifras, equipo y cómo colaborar'
        ),
        'keywords': [
            'asociacion', 'ong', 'sin animo de lucro', 'non-profit', 'nonprofit', 'non profit', 'charity',
            'solidari', 'voluntari', 'volunteer', 'donac', 'donat', 'fundacion', 'foundation', 'social',
            'medio ambiente', 'environment', 'comunidad', 'community',
        ],
    },
    {
        'id': 'conference',
        'language': 'en',
        'title': {'es': 'Conferencia o evento', 'en': 'Conference or event'},
        'prompt': (
            'Website for DevNorth 2027, a two-day developer conference in Edinburgh, with a schedule '
            'timeline, speakers, ticket pricing and an FAQ'
        ),
        'keywords': [
            'conferencia', 'conference', 'evento', 'event', 'congreso', 'summit', 'festival', 'meetup',
            'jornadas', 'ponentes', 'speaker', 'entradas', 'tickets', 'agenda', 'schedule', 'workshop',
            'taller', 'hackathon',
        ],
    },
    {
        'id': 'online-course',
        'language': 'es',
        'title': {'es': 'Curso online', 'en': 'Online course'},
        'prompt': (
            'Landing para un curso online de fotografía móvil llamado Foto en Tu Bolsillo, con temario, '
            'testimonios de alumnos, precio y preguntas frecuentes'
        ),
        'keywords': [
            'curso', 'course', 'online', 'formacion', 'training program', 'academia', 'academy', 'clase',
            'lesson', 'aprender', 'learn', 'alumno', 'student', 'temario', 'curriculum', 'bootcamp',
            'masterclass', 'ebook', 'tutorial', 'fotografia', 'photography',
        ],
    },
    {
        'id': 'consultancy',
        'language': 'en',
        'title': {'es': 'Consultoría', 'en': 'Consultancy'},
        'prompt': (
            'Website for Arden & Wells, a small management consultancy helping manufacturing companies '
            'cut costs, with services, results in numbers, the team and a contact form'
        ),
        'keywords': [
            'consultor', 'consultan', 'consulting', 'consultancy', 'asesor', 'advisor', 'advisory',
            'agency', 'agencia', 'despacho', 'firm', 'abogad', 'lawyer', 'law', 'contab', 'accounting',
            'empresa', 'company', 'enterprise', 'servicios profesionales', 'professional services',
        ],
    },
    {
        'id': 'small-shop',
        'language': 'es',
        'title': {'es': 'Tienda artesanal', 'en': 'Small craft shop'},
        'prompt': (
            'Tienda online de Tinta y Barro, cerámica artesanal hecha a mano en Sevilla, con productos '
            'destacados, la historia del taller, opiniones y contacto'
        ),
        'keywords': [
            'tienda', 'shop', 'store', 'ecommerce', 'e-commerce', 'artesan', 'handmade', 'craft', 'ceramic',
            'producto', 'product', 'comprar', 'buy', 'boutique', 'joyeria', 'jewelry', 'ropa', 'clothing',
            'regalo', 'gift', 'taller', 'workshop',
        ],
    },
]

MIN_BLOCKS = 5
MAX_BLOCKS = 12

# Text fields that must not be empty in a page that will be shown as an example
# (the editor accepts empty strings, a demo page should not have them)
IMAGE_FIELDS = {'src', 'image', 'backgroundImage', 'logoImage', 'alt'}


def review_blocks(blocks: list[dict]) -> list[str]:
    """What is wrong with a generated page as a demo example (empty list = fine)."""
    problems = []
    if not MIN_BLOCKS <= len(blocks) <= MAX_BLOCKS:
        problems.append(f'{len(blocks)} blocks, expected {MIN_BLOCKS} to {MAX_BLOCKS}')
    if blocks and blocks[0]['type'] != 'navbar':
        problems.append('the first block is not a navbar')
    if blocks and blocks[-1]['type'] != 'footer':
        problems.append('the last block is not a footer')

    for index, block in enumerate(blocks):
        schema = BLOCK_SCHEMAS[block['type']]['fields']
        for name, spec in schema.items():
            value = block['data'].get(name)
            where = f'block {index} ({block["type"]}) {name}'
            if spec['type'] == 'list':
                if not isinstance(value, list) or not spec['min_items'] <= len(value) <= spec['max_items']:
                    problems.append(f'{where}: list length out of range')
                    continue
                for item_index, item in enumerate(value):
                    for item_name, item_spec in spec['items'].items():
                        if item_spec.get('required') and not str(item.get(item_name, '')).strip():
                            problems.append(f'{where}[{item_index}].{item_name} is empty')
            elif spec.get('required') and name not in IMAGE_FIELDS and not str(value or '').strip():
                problems.append(f'{where} is empty')
    return problems


class Command(BaseCommand):
    help = 'Generate the saved demo pages with the real pipeline (needs the server Gemini key).'

    def add_arguments(self, parser):
        parser.add_argument('--env-file', help='.env file to read GOOGLE_AI_KEY from (default: the settings)')
        parser.add_argument('--only', nargs='*', default=[], help='Only these fixture ids')
        parser.add_argument('--force', action='store_true', help='Regenerate fixtures that already exist')
        parser.add_argument('--max-calls', type=int, default=25, help='Hard cap on provider calls (default 25)')
        parser.add_argument('--pause', type=float, default=7.0, help='Seconds between calls (free-tier rate limit)')
        parser.add_argument('--dry-run', action='store_true', help='List what would be generated and stop')

    def handle(self, *args, **options):
        specs = [s for s in FIXTURE_SPECS if not options['only'] or s['id'] in options['only']]
        unknown = set(options['only']) - {s['id'] for s in FIXTURE_SPECS}
        if unknown:
            raise CommandError(f'Unknown fixture ids: {", ".join(sorted(unknown))}')

        pending = [s for s in specs if options['force'] or not (FIXTURES_DIR / f'{s["id"]}.json').exists()]
        self.stdout.write(f'{len(pending)} of {len(specs)} fixtures to generate.')
        if options['dry_run'] or not pending:
            for spec in pending:
                self.stdout.write(f'  {spec["id"]} ({spec["language"]})')
            return

        api_key = self._load_key(options['env_file'])
        calls = 0
        failures = []

        def counted_call(system_prompt, user_message, provider, key):
            nonlocal calls
            if calls >= options['max_calls']:
                raise CommandError(f'Reached the cap of {options["max_calls"]} provider calls.')
            if calls:
                time.sleep(options['pause'])
            calls += 1
            return providers.call_ai(system_prompt, user_message, provider, key)

        FIXTURES_DIR.mkdir(exist_ok=True)
        for spec in pending:
            try:
                generated = generate_blocks(
                    spec['prompt'], '', spec['language'], 'gemini', api_key, call=counted_call,
                )
            except ProviderQuotaError:
                raise CommandError(f'The provider reports its quota is used up. Stopping after {calls} calls.')
            except ProviderCallError as exc:
                # Class, HTTP code and status are enough to diagnose; the message could echo request details
                code = getattr(exc.cause, 'code', '-')
                reason = getattr(exc.cause, 'status', '-')
                raise CommandError(
                    f'The provider call failed ({type(exc.cause).__name__}, code {code}, status {reason}). '
                    f'Stopping after {calls} calls.'
                )
            except InvalidOutputError as exc:
                failures.append(f'{spec["id"]}: invalid output ({"; ".join(exc.errors[:3])})')
                self.stdout.write(self.style.WARNING(f'{spec["id"]}: invalid output, not saved'))
                continue

            problems = review_blocks(generated.blocks)
            if problems:
                failures.append(f'{spec["id"]}: {"; ".join(problems[:4])}')
                self.stdout.write(self.style.WARNING(f'{spec["id"]}: failed review, not saved: {problems[:4]}'))
                continue

            path = FIXTURES_DIR / f'{spec["id"]}.json'
            self._write(path, spec, generated.blocks)
            self.stdout.write(self.style.SUCCESS(
                f'{spec["id"]}: {len(generated.blocks)} blocks '
                f'({generated.tokens_in} in / {generated.tokens_out} out tokens)'
            ))

        self.stdout.write(f'Provider calls made: {calls}.')
        if failures:
            raise CommandError('Some fixtures were not saved:\n  ' + '\n  '.join(failures))

    def _load_key(self, env_file: str | None) -> str:
        if env_file:
            path = Path(env_file)
            if not path.is_file():
                raise CommandError(f'{env_file} does not exist.')
            key = dotenv_values(path).get('GOOGLE_AI_KEY') or ''
        else:
            key = settings.GOOGLE_AI_KEY
        if not key:
            raise CommandError('No GOOGLE_AI_KEY found.')
        return key

    def _write(self, path: Path, spec: dict, blocks: list[dict]) -> None:
        document = {
            'id': spec['id'],
            'language': spec['language'],
            'title': spec['title'],
            'origin': 'generated',
            'prompt': spec['prompt'],
            'keywords': spec['keywords'],
            'blocks': blocks,
        }
        path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
