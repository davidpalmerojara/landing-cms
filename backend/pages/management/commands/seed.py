from django.core.management.base import BaseCommand
from pages.models import Page, Block


SAMPLE_BLOCKS = [
    {
        'type': 'hero',
        'order': 0,
        'data': {
            'title': 'Build Beautiful Landing Pages',
            'subtitle': 'Create stunning, conversion-optimized pages in minutes with our visual editor.',
            'ctaText': 'Get Started Free',
        },
        'styles': {'paddingTop': '80', 'paddingBottom': '80'},
    },
    {
        'type': 'features',
        'order': 1,
        'data': {
            'title': 'Everything You Need',
            'subtitle': 'Powerful features to help you build and launch faster.',
            'features': [
                {'title': 'Visual Editor', 'description': 'Drag and drop blocks to build your page.'},
                {'title': 'Responsive', 'description': 'Looks great on desktop, tablet, and mobile.'},
                {'title': 'Fast', 'description': 'Optimized for speed and performance.'},
            ],
        },
        'styles': {'paddingTop': '60', 'paddingBottom': '60'},
    },
    {
        'type': 'testimonials',
        'order': 2,
        'data': {
            'title': 'What Our Users Say',
            'testimonials': [
                {'quote': 'This tool saved us weeks of development time.', 'author': 'Maria G.', 'role': 'CTO, TechStartup'},
                {'quote': 'The easiest page builder I have ever used.', 'author': 'Carlos R.', 'role': 'Marketing Lead'},
            ],
        },
        'styles': {'paddingTop': '60', 'paddingBottom': '60'},
    },
    {
        'type': 'cta',
        'order': 3,
        'data': {
            'title': 'Ready to Get Started?',
            'subtitle': 'Join thousands of teams building better landing pages.',
            'ctaText': 'Start Building',
        },
        'styles': {'paddingTop': '80', 'paddingBottom': '80'},
    },
    {
        'type': 'footer',
        'order': 4,
        'data': {
            'companyName': 'BuilderPro',
            'links': ['Privacy', 'Terms', 'Contact'],
        },
        'styles': {},
    },
]


class Command(BaseCommand):
    help = 'Seed the database with a sample landing page'

    def handle(self, *args, **options):
        page, created = Page.objects.get_or_create(
            slug='sample-landing',
            defaults={'name': 'Sample Landing Page', 'status': Page.Status.DRAFT},
        )

        if not created:
            self.stdout.write(self.style.WARNING('Sample page already exists, skipping.'))
            return

        for block_data in SAMPLE_BLOCKS:
            Block.objects.create(page=page, **block_data)

        self.stdout.write(self.style.SUCCESS(
            f'Created sample page "{page.name}" with {len(SAMPLE_BLOCKS)} blocks (id: {page.id})'
        ))
