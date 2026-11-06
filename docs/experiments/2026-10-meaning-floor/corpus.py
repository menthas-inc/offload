# The labelled set the meaning floor is calibrated on (2026-10-31).
#
# Shaped like what people dump: mostly short titles, some with a body, filed
# under a thread, and embedded the way the agent embeds them
# ("Thread / Title\n\nbody", embed.py with_breadcrumb). Invented, not anyone's
# data: no account's content leaves the database for this.
#
# Each query lists the rows a person would be glad to see for it. Anything
# unlisted counts as irrelevant, so the labels lean strict.

DOCS = {
    # whistler ski trip
    "s1": ("whistler ski trip", "Buy snowboard", ""),
    "s2": ("whistler ski trip", "Buy flights", "Vancouver, leave Friday morning, back Monday night"),
    "s3": ("whistler ski trip", "Book lift passes", "Epic pass covers Whistler Blackcomb, buy before the 15th"),
    "s4": ("whistler ski trip", "Rent ski jackets for the kids", ""),
    "s5": ("whistler ski trip", "Trip dates", "Feb 21st to March 1st, Kyle and Ana coming too"),
    "s6": ("whistler ski trip", "Cabin booking confirmation", "Creekside cabin, check in 4pm, code 4417"),
    "s7": ("whistler ski trip", "Wax the boards", ""),
    # job search
    "j1": ("job search", "Finish resume and send to Gary", ""),
    "j2": ("job search", "make personal website", "portfolio with the studio work and the AI projects"),
    "j3": ("job search", "Interview prep for Retool", "system design, behavioural, ask about the team"),
    "j4": ("job search", "contract work", "rates for contract gigs, 120 an hour minimum"),
    "j5": ("job search", "Follow up with the recruiter at Stripe", ""),
    "j6": ("job search", "Salary expectations", "base 210 plus equity, check levels.fyi"),
    "j7": ("job search", "Reference letter from Dana", ""),
    # home
    "h1": ("Home", "Pay mortgage", ""),
    "h2": ("Home", "Pay $40k taxes", "quarterly estimate, due January 15"),
    "h3": ("Home", "Boiler service", "the heater makes a banging noise, call Mike the plumber"),
    "h4": ("Home", "Wifi password", "network offload-home, password on the router sticker"),
    "h5": ("Home", "Replace the smoke alarm batteries", ""),
    "h6": ("Home", "Landlord's number", "Pete, 415 555 0182"),
    "h7": ("Home", "Fix the leaking kitchen tap", ""),
    "h8": ("Home", "Home insurance renewal", "renews in December, compare quotes"),
    # groceries
    "g1": ("Groceries", "Kiwi", ""),
    "g2": ("Groceries", "Banana", ""),
    "g3": ("Groceries", "Eggs", ""),
    "g4": ("Groceries", "Oat milk", ""),
    "g5": ("Groceries", "Any interesting fruit", ""),
    "g6": ("Groceries", "Sourdough loaf", ""),
    "g7": ("Groceries", "Coffee beans", "the Ethiopian ones from Sightglass"),
    # Studio
    "m1": ("Studio", "Respond to studio inquiries", ""),
    "m2": ("Studio", "Studio rental rates", "Larine: 60 an hour, 400 for a full day"),
    "m3": ("Studio", "Mix the Yalda session", "vocals need a de-esser, send stems by Friday"),
    "m4": ("Studio", "Buy new monitor speakers", "Genelec 8030 or Adam A7X"),
    "m5": ("Studio", "Book Zeinab for the recording", ""),
    "m6": ("Studio", "Invoice Alex Hamm", "two sessions in October"),
    # App fixes
    "a1": ("App fixes", "Prompt injection", "a pasted page can tell the model to do things, guard the tools"),
    "a2": ("App fixes", "experiment with auto-prompt tuning", ""),
    "a3": ("App fixes", "memory management", "the worker leaks on long voice notes"),
    "a4": ("App fixes", "Search should fold accents", ""),
    "a5": ("App fixes", "Dark mode contrast on the composer", ""),
    # Future vacations
    "v1": ("Future vacations", "Fjord", "Norway, Geirangerfjord cruise in June"),
    "v2": ("Future vacations", "Ice", "Iceland ring road, ten days"),
    "v3": ("Future vacations", "upstate with fam", "cabin near the Catskills, fall colours"),
    "v4": ("Future vacations", "Lisbon for a long weekend", "Alfama, pastel de nata, Sintra day trip"),
    "v5": ("Future vacations", "Japan in cherry blossom season", "Kyoto and Tokyo, early April"),
    # Health
    "d1": ("Health", "Dentist appointment", "Dr Patel, Tuesday 3pm, cleaning"),
    "d2": ("Health", "Refill the allergy prescription", ""),
    "d3": ("Health", "Physio for the knee", "twice a week, exercises in the PDF"),
    "d4": ("Health", "Ana's shoe size is 38", ""),
    # Recipes
    "r1": ("Recipes", "Miso aubergine, a recipe", "aubergine halves, white miso, mirin, roast at 200"),
    "r2": ("Recipes", "Dinner at ours with Tom", "Friday, he's vegetarian, make the risotto"),
    "r3": ("Recipes", "Lemon drizzle cake", ""),
    "r4": ("Recipes", "Kimchi fried rice", "day old rice, gochujang, fried egg on top"),
    # Kids
    "k1": ("Kids", "School pickup schedule", "Mon Wed Fri me, Tue Thu Meera"),
    "k2": ("Kids", "Birthday party for Leo", "Saturday 2pm, bring a present, he likes dinosaurs"),
    "k3": ("Kids", "Swimming lessons sign up", ""),
    "k4": ("Kids", "Parent teacher meeting", "Thursday 5pm, room 12"),
    # Movies
    "f1": ("Movies to watch", "Past Lives", ""),
    "f2": ("Movies to watch", "The Zone of Interest", ""),
    "f3": ("Movies to watch", "Dune part two", ""),
    # Car
    "c1": ("Car", "MOT due", "book at the garage on Mill Road"),
    "c2": ("Car", "Winter tyres", "swap before the ski trip"),
    "c3": ("Car", "Parking permit renewal", ""),
}

# (query, relevant ids, kind). Kinds: "full" a whole question or phrase,
# "word" one word that names no row, "prefix" what Search sends while typing
# (from 4 letters), "negative" nothing in the corpus should come back.
QUERIES = [
    ("snowboarding", ["s1", "s7", "s3"], "word"),
    ("skiing holiday", ["s1", "s2", "s3", "s4", "s5", "s6", "s7"], "full"),
    ("when is the ski trip", ["s5", "s2"], "full"),
    ("where are we staying in whistler", ["s6"], "full"),
    ("holiday abroad", ["v1", "v2", "v4", "v5", "s2"], "full"),
    ("travel plans", ["v1", "v2", "v3", "v4", "v5", "s2", "s5"], "full"),
    ("employment", ["j1", "j2", "j3", "j4", "j5", "j6", "j7"], "word"),
    ("how much should I ask for in salary", ["j6", "j4"], "full"),
    ("my CV", ["j1"], "full"),
    ("interview", ["j3"], "word"),
    ("heating broken", ["h3"], "full"),
    ("the heater was replaced", ["h3"], "full"),
    ("internet login", ["h4"], "full"),
    ("bills to pay", ["h1", "h2", "h8"], "full"),
    ("tax deadline", ["h2"], "full"),
    ("what do I need from the shop", ["g1", "g2", "g3", "g4", "g5", "g6", "g7"], "full"),
    ("fruit", ["g1", "g2", "g5"], "word"),
    ("breakfast", ["g3", "g4", "g6", "g7"], "word"),
    ("music production", ["m1", "m2", "m3", "m4", "m5"], "full"),
    ("how much is the studio", ["m2"], "full"),
    ("speakers", ["m4"], "word"),
    ("security bug", ["a1"], "full"),
    ("LLM prompts", ["a1", "a2"], "full"),
    ("Norway", ["v1"], "word"),
    ("Portugal trip", ["v4"], "full"),
    ("teeth", ["d1"], "word"),
    ("knee pain", ["d3"], "full"),
    ("what size shoes does Ana wear", ["d4"], "full"),
    ("vegetarian dinner", ["r1", "r2"], "full"),
    ("something with eggplant", ["r1"], "full"),
    ("Korean food", ["r4"], "full"),
    ("baking", ["r3", "g6"], "word"),
    ("kids activities", ["k2", "k3"], "full"),
    ("who picks up the children on Tuesday", ["k1"], "full"),
    ("films", ["f1", "f2", "f3"], "word"),
    ("car service", ["c1", "c2"], "full"),
    ("tires", ["c2"], "word"),
    ("vacances au Japon", ["v5"], "full"),
    ("Zahnarzt", ["d1"], "word"),
    # What Search sends while typing, from four letters.
    ("snow", ["s1", "s7"], "prefix"),
    ("snowbo", ["s1", "s7"], "prefix"),
    ("resu", ["j1"], "prefix"),
    ("mortg", ["h1"], "prefix"),
    ("dent", ["d1"], "prefix"),
    ("whist", ["s1", "s2", "s3", "s4", "s5", "s6", "s7"], "prefix"),
    ("lisb", ["v4"], "prefix"),
    ("boil", ["h3"], "prefix"),
    ("recip", ["r1", "r2", "r3", "r4"], "prefix"),
    # Nothing here should come back.
    ("xqzvt plork", [], "negative"),
    ("asdf", [], "negative"),
    ("quantum chromodynamics", [], "negative"),
    ("best laptop for 2026", [], "negative"),
    ("what's the weather in Tokyo tomorrow", [], "negative"),
    ("who won the world cup", [], "negative"),
    ("how tall is the Eiffel tower", [], "negative"),
    ("latest news about the election", [], "negative"),
    ("bitcoin price", [], "negative"),
    ("translate hello into Spanish", [], "negative"),
    ("python list comprehension syntax", [], "negative"),
    ("lawnmower", [], "negative"),
    ("wedding anniversary gift ideas", [], "negative"),
    ("gym membership", [], "negative"),
    ("thrd", [], "negative"),
]
