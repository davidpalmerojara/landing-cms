from django.db import migrations, models


def source_from_own_key(apps, schema_editor):
    AIGenerationLog = apps.get_model('ai_generation', 'AIGenerationLog')
    AIGenerationLog.objects.filter(used_own_key=True).update(source='own_key')


def own_key_from_source(apps, schema_editor):
    AIGenerationLog = apps.get_model('ai_generation', 'AIGenerationLog')
    AIGenerationLog.objects.filter(source='own_key').update(used_own_key=True)


class Migration(migrations.Migration):

    dependencies = [
        ('ai_generation', '0002_aigenerationlog_used_own_key'),
    ]

    operations = [
        migrations.AddField(
            model_name='aigenerationlog',
            name='source',
            field=models.CharField(
                choices=[('demo', 'Saved demo response'), ('live', 'Server key'), ('own_key', "User's own key")],
                default='live',
                max_length=10,
            ),
        ),
        # Every log written until now came from a real provider call
        migrations.RunPython(source_from_own_key, own_key_from_source),
        migrations.RemoveField(
            model_name='aigenerationlog',
            name='used_own_key',
        ),
        migrations.AddIndex(
            model_name='aigenerationlog',
            index=models.Index(fields=['source', 'created_at'], name='ai_generati_source_abc70f_idx'),
        ),
    ]
