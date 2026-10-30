"""What a query may carry out of the dump. 016 AC-24.

The rule is a bound on composition rather than on judgement, which is the only
kind that survives an injected instruction: the planner may use everything it
knows to decide *whether* to look something up, and may only send the words in
front of it.

These are the cases that made the rule what it is. Three of the four relaxations
below exist because the first version refused a real turn in production or in an
eval, and the last test is the one that says the relaxations did not open it.
"""

from offload_agent.worker import _from_the_dump, _in_the_dump


def test_the_dumps_own_words_pass():
    assert _from_the_dump("memorial day", "add a todo on memorial day to call mum")


def test_function_words_may_be_added():
    # The flagship case, refused by the first version: "when" and "is" are not
    # in the dump and carry nothing.
    assert _from_the_dump("when is mothers day", "book the restaurant for mothers day")


def test_this_year_may_be_added():
    from datetime import date

    year = date.today().year
    assert _from_the_dump(f"remembrance sunday {year}", "remembrance sunday, call grandad")
    assert _from_the_dump(f"remembrance sunday {year + 1}", "remembrance sunday, call grandad")


def test_a_word_in_a_different_shape_passes():
    assert _from_the_dump(
        "is the bridge open sunday for cycling to the coast",
        "cycle to the coast sunday if the bridge is open",
    )


def test_a_name_that_is_not_in_the_dump_does_not_pass():
    # The whole point. A note somebody else wrote in a shared thread must not be
    # able to steer a query carrying their details to a search company.
    assert not _from_the_dump("ana de sousa address", "when does the tip close")


def test_a_number_that_is_not_a_year_does_not_pass():
    assert not _from_the_dump("flat 34 arlington road", "when does the tip close")
    assert not _from_the_dump("07700 900123", "when does the tip close")


def test_an_ordinal_in_the_dump_admits_its_number():
    assert _from_the_dump("rail strike 22", "is there a rail strike on the 22nd")
    assert not _from_the_dump("rail strike 23", "is there a rail strike on the 22nd")


def test_an_old_year_does_not_pass():
    assert not _from_the_dump("something 1987", "when does the tip close")


def test_the_stem_is_a_prefix_match_and_that_is_accepted():
    """ "card" in the dump does let "cardiff" through, and that is not a hole.

    Four letters of shared prefix is a blunt stand-in for a stemmer, so it lets
    some genuinely different words past. Written down rather than tightened,
    because the thing the bound protects is unaffected: only the person's own
    dump fills the haystack, so a note somebody else wrote in a shared thread
    contributes no words at all and cannot reach the query through a stem. The
    person extending their own word is not the threat.

    A three-letter stem would be a hole worth closing, because "car" reaches most
    of the dictionary. Four does not.
    """
    assert _from_the_dump("cardiff", "where is my card")
    # Three letters shared is not enough.
    assert not _from_the_dump("cardiff", "where is my car")


def test_a_url_has_to_have_been_dumped():
    dump = "https://www.rightmove.co.uk/properties/123 viewing next week"
    assert _in_the_dump("https://www.rightmove.co.uk/properties/123", dump)
    # Not one the model composed, and not one that appeared inside a page.
    assert not _in_the_dump("https://evil.example.com/steal", dump)


def test_every_refusal_in_the_lookup_path_leaves_a_record():
    """No silent branch, ever again.

    Three separate refusal paths returned without touching the ledger or the
    log, and each one cost an hour: a turn refused by a bound looked exactly
    like a turn that never wanted a lookup, in the table and in the log both.
    This reads the source rather than exercising ten branches, which is blunt
    and is the point: the claim is about the shape of the function.
    """
    import inspect
    import re

    from offload_agent import worker

    body = inspect.getsource(worker._look_up)
    # Everything up to the reader call. Past that the outcome is recorded once,
    # for success and failure alike.
    guard = body.split("reading = await reader.read")[0]

    lines = guard.splitlines()
    refusals = [i for i, line in enumerate(lines) if re.search(r"return _declined\(", line)]
    assert refusals, "the guard clauses moved; this test needs rewriting"

    for i in refusals:
        window = "\n".join(lines[max(0, i - 6) : i])
        assert "budget.record(" in window, f"a refusal with no record near line {i}: {lines[i]!r}"


def test_their_own_country_may_be_added_to_a_query():
    """A bank holiday with no country attached has no answer.

    Asked for the next one, offload answered Columbus Day from three American
    sources: correct somewhere, wrong for the person who asked. The country has
    to reach the query, and it is never in the dump. Safe for the same reason the
    year and the month names are: a closed set of about 250 values, chosen by
    them in Settings, carrying nothing anybody wrote.
    """
    dump = "when is the next bank holiday"
    assert not _from_the_dump("next bank holiday united kingdom", dump)
    assert _from_the_dump("next bank holiday united kingdom", dump, "United Kingdom")


def test_the_country_does_not_open_the_bound_to_anything_else():
    assert not _from_the_dump("ana de sousa address", "when is the next bank holiday", "Portugal")


# 2026-10-13, the owner's call: a word the bound would refuse is dropped and
# the rest is searched, rather than the whole lookup refused and the model
# left to retry. What leaves is still only their words, the filler and their
# country, which is exactly what the bound allowed before.

from offload_agent.worker import _within_the_dump  # noqa: E402


def test_a_word_they_did_not_write_is_dropped_and_the_rest_kept_in_order():
    dump = "is the march on saturday going past the office"
    assert _within_the_dump("march saturday route Portugal", dump, "PT") == (
        "march saturday portugal"
    )


def test_a_query_that_passes_is_sent_as_it_was():
    dump = "book the restaurant for mothers day"
    assert _within_the_dump("when is mothers day", dump) == "when is mothers day"


def test_a_query_with_none_of_their_words_left_is_still_refused():
    assert _within_the_dump("ana de sousa address", "when is the next bank holiday", "PT") is None
    assert _within_the_dump("when is it Portugal", "check the boiler", "PT") is None


async def test_the_lookup_searches_the_kept_words_instead_of_refusing(monkeypatch):
    from types import SimpleNamespace

    from offload_agent import reader
    from offload_agent.worker import Lookups, _look_up

    asked = []

    async def fake_read(client, model, **kw):
        asked.append(kw["question"])
        return SimpleNamespace(
            searches=1,
            fetches=0,
            usage=[],
            failed=False,
            found=SimpleNamespace(sources=[], label="other", unsure=True, fields={}),
        )

    monkeypatch.setattr(reader, "read", fake_read)
    budget = Lookups(
        "is the march on saturday going past the office",
        may_search=True,
        may_read_links=False,
        country="PT",
    )
    await _look_up(
        None,
        SimpleNamespace(sort_model="m", reader_model="m"),
        budget,
        {"question": "march saturday route Portugal", "want": ["fact"]},
    )
    assert asked == ["march saturday portugal"]


def test_a_query_mostly_from_somewhere_else_is_refused_whole():
    """Security review, 2026-10-14: a query whose words mostly are not theirs
    was composed from something other than the dump, which is the signal the
    all-or-nothing bound used to act on. More than half dropped is refused."""
    dump = "dinner in lisbon on friday"
    assert _within_the_dump("ana de sousa home address lisbon", dump, "PT") is None
    assert _within_the_dump("dinner lisbon friday route", dump, "PT") == "dinner lisbon friday"
