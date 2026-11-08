#!/usr/bin/env python3
"""Выпуск сборки qplate: номер по дате плюс счётчик.

Правит CHANGELOG.md и подпись версии в apps.js, чтобы номер
не приходилось вписывать руками в двух местах.

    python3 release.py "что изменилось; что ещё" --schema нет
    python3 release.py --check
    python3 release.py --undo
"""

import argparse
import datetime
import re
import shutil
import sys
import zoneinfo
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CHANGELOG = ROOT / "CHANGELOG.md"
APPS = ROOT / "apps.js"

ENTRY_RE = re.compile(r"^## (\d{4})\.(\d{2})\.(\d{2})\.(\d+)\b", re.M)
WATERMARK_RE = re.compile(r"settings-watermark\"\)[\s\S]*?· (\d{4}\.\d{2}\.\d{2}\.\d+)")


def moscow_today():
    return datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Moscow")).date()


def last_build(text):
    """Последняя сборка в истории: (дата, счётчик) или None."""
    match = ENTRY_RE.search(text)
    if not match:
        return None
    year, month, day, counter = (int(part) for part in match.groups())
    return datetime.date(year, month, day), counter


def next_build(text):
    today = moscow_today()
    previous = last_build(text)
    if previous and previous[0] == today:
        counter = previous[1] + 1
    else:
        counter = 1
    return "%04d.%02d.%02d.%d" % (today.year, today.month, today.day, counter), today


def watermark(text):
    match = WATERMARK_RE.search(text)
    return match.group(1) if match else None


def history_start(text):
    match = ENTRY_RE.search(text)
    return match.start() if match else len(text)


def build_entry(number, today, summary, schema, migration):
    lines = ["## %s — %s" % (number, today.isoformat()), ""]
    if schema == "нет":
        lines.append("Схема: без изменений.")
    else:
        lines.append("Схема: изменилась (%s)." % schema)
        if migration:
            lines.append("Нужна миграция: %s." % migration.rstrip("."))
    lines.append("")
    for item in summary:
        lines.append("- %s;" % item.rstrip(";."))
    lines.append("")
    return "\n".join(lines) + "\n"


def save_pair(changelog_text, apps_text):
    for path, text in ((CHANGELOG, changelog_text), (APPS, apps_text)):
        shutil.copyfile(path, path.with_name(path.name + ".release-prev"))
        path.write_text(text, encoding="utf-8")


def cmd_check():
    changelog_text = CHANGELOG.read_text(encoding="utf-8")
    apps_text = APPS.read_text(encoding="utf-8")
    previous = last_build(changelog_text)
    if not previous:
        print("в истории нет ни одной сборки")
        return 1
    number = "%04d.%02d.%02d.%d" % (
        previous[0].year, previous[0].month, previous[0].day, previous[1])
    shown = watermark(apps_text)
    if shown != number:
        print("расхождение: история %s, подпись %s" % (number, shown or "не найдена"))
        return 1
    print(number)
    return 0


def cmd_undo():
    for path in (CHANGELOG, APPS):
        previous = path.with_name(path.name + ".release-prev")
        if not previous.exists():
            print("откатывать нечего: нет %s" % previous.name)
            return 1
    for path in (CHANGELOG, APPS):
        previous = path.with_name(path.name + ".release-prev")
        shutil.copyfile(previous, path)
        previous.unlink()
    print("откачено: CHANGELOG.md и apps.js в прежнем виде")
    return 0


def cmd_release(summary, schema, migration):
    changelog_text = CHANGELOG.read_text(encoding="utf-8")
    apps_text = APPS.read_text(encoding="utf-8")
    number, today = next_build(changelog_text)
    if not WATERMARK_RE.search(apps_text):
        print("не найдена подпись settings-watermark в apps.js")
        return 1

    start = history_start(changelog_text)
    entry = build_entry(number, today, summary, schema, migration)
    new_changelog = changelog_text[:start] + entry + changelog_text[start:]
    new_apps = WATERMARK_RE.sub(
        lambda m: m.group(0).replace(m.group(1), number, 1),
        apps_text, count=1)
    save_pair(new_changelog, new_apps)
    print("сборка %s: история и подпись обновлены" % number)
    return 0


def main(argv):
    parser = argparse.ArgumentParser(description="выпустить сборку qplate")
    parser.add_argument("summary", nargs="*", help="что изменилось, по пунктам")
    parser.add_argument("--schema", default="нет",
                        help="нет (по умолчанию) или файл схемы, например data.js")
    parser.add_argument("--migrate", default="", help="правило переноса черновика")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--undo", action="store_true")
    args = parser.parse_args(argv)

    if args.check:
        return cmd_check()
    if args.undo:
        return cmd_undo()
    summary = [item.strip() for item in " ".join(args.summary).split(";")
               if item.strip()]
    if not summary:
        parser.error("напиши, что изменилось: \"правка окон; новые обои\"")
    return cmd_release(summary, args.schema, args.migrate)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
