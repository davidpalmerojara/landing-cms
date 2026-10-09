from django.core.management.base import BaseCommand
from django.db import transaction

from pages.block_validators import clean_block_data
from pages.models import Page, Block


# Block data in the shapes the editor stores (lists are arrays of objects).
# create_sample_blocks() runs every block through clean_block_data, the same
# validation as the API, so a stale sample fails loudly instead of seeding
# data the editor would reject.
SAMPLE_BLOCKS = [
    {
        'type': 'navbar',
        'data': {
            'brandName': 'Paxl',
            'links': [
                {'label': 'Features', 'url': '#features'},
                {'label': 'Pricing', 'url': '#pricing'},
                {'label': 'FAQ', 'url': '#faq'},
            ],
            'ctaText': 'Get Started',
            'ctaLink': '#contact',
        },
        'styles': {},
    },
    {
        'type': 'hero',
        'data': {
            'title': 'Build Beautiful Landing Pages',
            'subtitle': 'Create stunning, conversion-optimized pages in minutes with our visual editor.',
            'buttonText': 'Get Started Free',
            'buttonLink': '#pricing',
            'alignment': 'center',
        },
        'styles': {},
    },
    {
        'type': 'features',
        'data': {
            'title': 'Everything You Need',
            'features': [
                {'title': 'Visual Editor', 'description': 'Drag and drop blocks to build your page.'},
                {'title': 'Responsive', 'description': 'Looks great on desktop, tablet, and mobile.'},
                {'title': 'Fast', 'description': 'Optimized for speed and performance.'},
            ],
        },
        'styles': {},
    },
    {
        'type': 'testimonials',
        'data': {
            'title': 'What Our Users Say',
            'testimonials': [
                {'quote': 'This tool saved us weeks of development time.', 'author': 'Maria G.', 'role': 'CTO, TechStartup'},
                {'quote': 'The easiest page builder I have ever used.', 'author': 'Carlos R.', 'role': 'Marketing Lead'},
            ],
        },
        'styles': {},
    },
    {
        'type': 'pricing',
        'data': {
            'title': 'Simple Pricing',
            'plans': [
                {
                    'name': 'Free',
                    'price': '$0',
                    'features': 'One page\nPaxl subdomain',
                    'buttonText': 'Start Free',
                    'buttonLink': '#contact',
                    'highlighted': False,
                },
                {
                    'name': 'Pro',
                    'price': '$19',
                    'features': 'Unlimited pages\nCustom domain\nAnalytics',
                    'buttonText': 'Go Pro',
                    'buttonLink': '#contact',
                    'highlighted': True,
                },
            ],
        },
        'styles': {},
    },
    {
        'type': 'faq',
        'data': {
            'title': 'Questions',
            'questions': [
                {'question': 'Is there a free plan?', 'answer': 'Yes, you can start for free.'},
                {'question': 'Can I use my own domain?', 'answer': 'Yes, on the Pro plan.'},
            ],
        },
        'styles': {},
    },
    {
        'type': 'cta',
        'data': {
            'title': 'Ready to Get Started?',
            'subtitle': 'Join thousands of teams building better landing pages.',
            'buttonText': 'Start Building',
        },
        'styles': {},
    },
    {
        'type': 'footer',
        'data': {
            'brandName': 'Paxl',
            'description': 'The visual editor for landing pages.',
            'copyright': '© Paxl',
            'links': [
                {'label': 'Privacy', 'url': ''},
                {'label': 'Terms', 'url': ''},
                {'label': 'Contact', 'url': '#contact'},
            ],
        },
        'styles': {},
    },
]


def create_sample_blocks(page: Page) -> int:
    """Create the sample blocks of `page`, validated like any API save."""
    for order, block in enumerate(SAMPLE_BLOCKS):
        Block.objects.create(
            page=page,
            type=block['type'],
            order=order,
            data=clean_block_data(block['type'], block['data']),
            styles=block['styles'],
        )
    return len(SAMPLE_BLOCKS)


class Command(BaseCommand):
    help = 'Seed the database with a sample landing page'

    @transaction.atomic
    def handle(self, *args, **options):
        page, created = Page.objects.get_or_create(
            slug='sample-landing',
            defaults={'name': 'Sample Landing Page', 'status': Page.Status.DRAFT},
        )

        if not created:
            self.stdout.write(self.style.WARNING('Sample page already exists, skipping.'))
            return

        count = create_sample_blocks(page)

        self.stdout.write(self.style.SUCCESS(
            f'Created sample page "{page.name}" with {count} blocks (id: {page.id})'
        ))
