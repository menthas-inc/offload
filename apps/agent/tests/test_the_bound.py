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


def test_an_old_year_does_not_pass():
    assert not _from_the_dump("something 1987", "when does the tip close")


def test_the_stem_is_a_prefix_match_and_that_is_accepted():
    """"card" in the dump does let "cardiff" through, and that is not a hole.

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
