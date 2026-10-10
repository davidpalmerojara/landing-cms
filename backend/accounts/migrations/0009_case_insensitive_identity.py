"""Email and username become unique ignoring case (D8, QA-017).

Before adding the constraints the migration looks for accounts that differ only
by case. If it finds any it stops and lists them: merging two accounts is a
decision for a person, not for a migration. Once the data is clean it
lower-cases every email (users and pending magic links).
"""
from collections import defaultdict

from django.db import migrations, models
from django.db.models.functions import Lower


def _collisions(rows):
    """{lower-cased value: [original values]} for the values that appear more than once."""
    groups = defaultdict(list)
    for value in rows:
        groups[value.lower()].append(value)
    return {key: values for key, values in groups.items() if len(values) > 1}


def refuse_duplicates(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    problems = []
    for field in ('email', 'username'):
        values = User.objects.exclude(**{field: ''}).values_list(field, flat=True)
        for lowered, originals in sorted(_collisions(values).items()):
            problems.append(f'  - {field} "{lowered}": {", ".join(sorted(originals))}')
    if problems:
        raise RuntimeError(
            'Cannot make email and username case-insensitive: these accounts differ only by case.\n'
            + '\n'.join(problems)
            + '\nDelete or rename the extra accounts (for example in the Django admin or the shell), '
            'then run the migration again.'
        )


def lowercase_emails(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    MagicToken = apps.get_model('accounts', 'MagicToken')
    for user in User.objects.exclude(email='').iterator():
        lowered = user.email.strip().lower()
        if lowered != user.email:
            User.objects.filter(pk=user.pk).update(email=lowered)
    for token in MagicToken.objects.iterator():
        lowered = token.email.strip().lower()
        if lowered != token.email:
            MagicToken.objects.filter(pk=token.pk).update(email=lowered)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_user_is_guest'),
    ]

    operations = [
        migrations.RunPython(refuse_duplicates, migrations.RunPython.noop),
        migrations.RunPython(lowercase_emails, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.UniqueConstraint(Lower('email'), name='user_email_ci_unique'),
        ),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.UniqueConstraint(Lower('username'), name='user_username_ci_unique'),
        ),
    ]
