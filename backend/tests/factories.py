import uuid
import factory
from factory.django import DjangoModelFactory

from accounts.models import User, MagicToken
from pages.models import Workspace, Page, Block, PageVersion, Asset, CustomDomain


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f'user{n}')
    email = factory.LazyAttribute(lambda obj: f'{obj.username}@example.com')
    password = factory.PostGenerationMethodCall('set_password', 'testpass123')


class WorkspaceFactory(DjangoModelFactory):
    class Meta:
        model = Workspace

    name = factory.Sequence(lambda n: f'Workspace {n}')
    owner = factory.SubFactory(UserFactory)


class PageFactory(DjangoModelFactory):
    class Meta:
        model = Page

    owner = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f'Page {n}')
    slug = factory.LazyAttribute(lambda obj: f'page-{uuid.uuid4().hex[:8]}')
    status = Page.Status.DRAFT
    theme_id = 'default'


class BlockFactory(DjangoModelFactory):
    class Meta:
        model = Block

    page = factory.SubFactory(PageFactory)
    type = 'hero'
    order = factory.Sequence(lambda n: n)
    data = factory.LazyFunction(dict)
    styles = factory.LazyFunction(dict)


class PageVersionFactory(DjangoModelFactory):
    class Meta:
        model = PageVersion

    page = factory.SubFactory(PageFactory)
    version_number = factory.Sequence(lambda n: n + 1)
    snapshot = factory.LazyFunction(list)
    page_metadata = factory.LazyFunction(dict)
    trigger = PageVersion.Trigger.MANUAL
    label = ''
    created_by = factory.SubFactory(UserFactory)
    size_bytes = 0


class AssetFactory(DjangoModelFactory):
    class Meta:
        model = Asset

    owner = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f'asset-{n}.png')
    mime_type = 'image/png'
    size = 1024


class MagicTokenFactory(DjangoModelFactory):
    class Meta:
        model = MagicToken

    email = factory.Sequence(lambda n: f'magic{n}@example.com')
    token = factory.LazyFunction(lambda: uuid.uuid4().hex)
    used = False


class CustomDomainFactory(DjangoModelFactory):
    class Meta:
        model = CustomDomain

    workspace = factory.SubFactory(WorkspaceFactory)
    page = factory.SubFactory(PageFactory)
    domain = factory.Sequence(lambda n: f'custom-{n}.example.com')
    dns_status = CustomDomain.DnsStatus.PENDING
    ssl_status = CustomDomain.SslStatus.PENDING
    is_active = False
