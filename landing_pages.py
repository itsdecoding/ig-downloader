"""Per-intent landing pages for InstaFetch.

The downloader itself lives in static/index.html. Rather than copying a 120KB
page four times (four things to keep in sync, four chances to break the ad
deck), each landing page is that same file with only the parts that describe
one Instagram format swapped out: title, meta, canonical, headline, how-to
steps, long-form copy, FAQ and structured data.

One engine, four front doors, four different search intents.

Everything here is server-rendered on purpose. Google has to see the copy and
the FAQ text in the HTML, not after a script runs.
"""

from __future__ import annotations

import html as _html
import re

SITE = "https://droplabs.site"

# Reused from the homepage how-to cards so the pages look identical.
ICON_LINK = """<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>"""

ICON_CLIPBOARD = """<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="8" y="2" width="8" height="4" rx="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            </svg>"""

ICON_DOWNLOAD = """<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>"""

ICONS = {"link": ICON_LINK, "clipboard": ICON_CLIPBOARD, "download": ICON_DOWNLOAD}


PAGES = {}


# --------------------------------------------------------------------------
# 1. Reels
# --------------------------------------------------------------------------
PAGES["instagram-reel-downloader"] = {
    "label": "Instagram Reel Downloader",
    "short": "Reels",
    "title": "Instagram Reel Downloader \u2014 Save Reels Without Watermark | InstaFetch",
    "desc": (
        "Download Instagram Reels in the original quality with the audio intact and no watermark. "
        "Paste the reel link, save an MP4 in seconds. Free, no login, works on iPhone and Android."
    ),
    "keywords": (
        "instagram reel downloader, download instagram reels, reel downloader, "
        "save instagram reel, ig reel download, reel video download"
    ),
    "h1": "Instagram Reel<br />Downloader",
    "badge": "REELS \u2022 AUDIO INCLUDED \u2022 NO WATERMARK",
    "steps_label": "3 Simple Steps",
    "howto_h2": "How to Download an Instagram Reel",
    "howto_sub": "Save any public reel to your camera roll in about ten seconds.",
    "steps": [
        (
            "link",
            "Copy the Reel Link",
            "Open the reel in Instagram, tap the \u22ef menu in the corner, then Copy Link. "
            "The share-sheet link with ?igsh= works too.",
        ),
        (
            "clipboard",
            "Paste It Into the Dock",
            "Drop the link into the box above and press Download. InstaFetch resolves the "
            "reel's direct video file \u2014 no login, no app install.",
        ),
        (
            "download",
            "Save the MP4",
            "The reel comes back as a standard MP4 with its audio. On iPhone tap Save Video "
            "to move it into Photos; on Android and desktop it lands in Downloads.",
        ),
    ],
    "body": """
      <h2 class="text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-white mb-4">Downloading a reel without the watermark</h2>
      <p>Instagram's own Save button only bookmarks a reel inside the app \u2014 it does not give you a file. To actually keep the video you need the direct MP4 that Instagram serves to the player, and that is exactly what this tool fetches.</p>
      <p>Nothing is re-encoded, re-cropped or stamped. The file you get is the same one the app streams, so the quality is whatever the creator uploaded, and there is no watermark anywhere on it.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">What quality you actually get</h3>
      <p>Reels are 9:16 vertical video. Most reels are published at 720&times;1280, and some at 1080&times;1920. We hand you the largest version Instagram publicly exposes for that post \u2014 we do not upscale it, because a stretched file is bigger without being better. If a reel looks soft, it was uploaded soft; no downloader can recover detail the creator never posted.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">The audio comes with it</h3>
      <p>The audio track is part of the MP4, so music, voiceover and sound effects arrive with the picture. That matters for reels specifically, because the audio is usually the reason someone wants the file. Keep in mind that a track licensed inside Instagram is licensed for Instagram \u2014 saving a reel for personal reference is not the same as republishing someone else's work commercially.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Which links work</h3>
      <p>Public reels work with every common link shape: <code class="text-white/80">instagram.com/reel/&hellip;</code>, <code class="text-white/80">instagram.com/reels/&hellip;</code>, and the share links Instagram generates with tracking parameters on the end. Private accounts do not work, and that is deliberate \u2014 there is no file to fetch without a login, and we never ask for one.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Reels, posts and stories are different things</h3>
      <p>A reel is a single vertical video. A feed post can be one photo, a video, or a carousel of up to twenty slides. A story disappears after 24 hours. Each has its own link format and its own quirks, which is why there is a dedicated page for each:</p>
    """,
    "faq": [
        (
            "Does the audio download with the reel?",
            "Yes. The MP4 contains both the video and the original audio track, so music and voiceover come through intact. No separate audio file is needed.",
        ),
        (
            "Will the person who posted the reel know I downloaded it?",
            "No. InstaFetch never logs in and never touches Instagram's viewer lists, so the creator is not notified and you do not appear anywhere.",
        ),
        (
            "Why is my reel 720p instead of 1080p?",
            "Because that is the file Instagram published. Most reels are served at 720x1280; some are 1080x1920. We always take the largest version available and never upscale, so the download is never worse than the app's own playback.",
        ),
        (
            "Can I download a reel from a private account?",
            "No. Private media is only reachable with a logged-in session, and we deliberately do not accept logins. If you can open the reel in your own account you can still copy its link, but the file itself is not publicly served.",
        ),
        (
            "Do I need to install an app or create an account?",
            "No. It runs in Safari, Chrome, Edge or Firefox on any device. Paste, download, done.",
        ),
        (
            "Is there a limit on how many reels I can save?",
            "No daily cap and no countdown timers. Save one reel or fifty; the tool treats them the same.",
        ),
    ],
}


# --------------------------------------------------------------------------
# 2. Stories
# --------------------------------------------------------------------------
PAGES["instagram-story-downloader"] = {
    "label": "Instagram Story Downloader",
    "short": "Stories",
    "title": "Instagram Story Downloader \u2014 Save Stories Anonymously | InstaFetch",
    "desc": (
        "Download Instagram stories and highlights before they expire. No login, no notification "
        "to the poster, no app. Paste the story link and save the photo or video."
    ),
    "keywords": (
        "instagram story downloader, download instagram stories, save instagram story, "
        "ig story download, instagram story saver, anonymous story viewer"
    ),
    "h1": "Instagram Story<br />Downloader",
    "badge": "STORIES \u2022 ANONYMOUS \u2022 NO NOTIFICATION",
    "steps_label": "3 Simple Steps",
    "howto_h2": "How to Save an Instagram Story",
    "howto_sub": "Grab a story or highlight before it disappears.",
    "steps": [
        (
            "link",
            "Copy the Story Link",
            "Open the story, tap the \u22ef menu and choose Copy Link. The same works for a "
            "story inside a highlight.",
        ),
        (
            "clipboard",
            "Paste It Above",
            "Drop the link into the dock and press Download. InstaFetch resolves the story's "
            "media file directly, without your account.",
        ),
        (
            "download",
            "Save Photo or Video",
            "Photos come back as JPG, videos as MP4. Save to Photos, Files or your Downloads "
            "folder \u2014 the story stays yours after it expires.",
        ),
    ],
    "body": """
      <h2 class="text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-white mb-4">Saving a story before it disappears</h2>
      <p>Stories live for 24 hours. After that the media is gone from the app, even though you may still want the recipe, the outfit, the announcement or the clip someone shared. Downloading the file is the only way to keep it \u2014 a bookmark does not exist for stories.</p>
      <p>Highlights are the exception: they are stories the creator chose to keep, and they sit on the profile permanently. The same link and the same tool handle both.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Nobody gets notified</h3>
      <p>InstaFetch never asks for your Instagram login, so there is no session, no viewer list and no trace. The poster does not see your name and does not get an alert. To be precise about what this is: the tool downloads the media file, it does not fake a view inside Instagram. If you open someone's story in the app, that view is Instagram's business, not ours.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">The link requirement, stated plainly</h3>
      <p>Instagram only exposes a story's media once you can open that story. That means the account has to be public, or you have to already be able to see the story from your own account. If an account is private and you do not follow it, there is no public URL for the story and no tool can produce one without your credentials \u2014 any site claiming otherwise is asking you to hand over your password, which is how accounts get stolen.</p>
      <p>So: copy the link while you can see the story, paste it here, save the file. That is the whole flow.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Photos, videos, and both</h3>
      <p>A story can be a still photo, a video clip, or a video with stickers and text baked in. Whatever the creator posted is what you get: JPG for photos, MP4 for video, at the resolution Instagram serves.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Stories versus highlights versus reels</h3>
      <p>Stories expire, highlights are the permanent version of stories, and reels are the public vertical videos on the grid. They are stored and served differently, so each has its own page here:</p>
    """,
    "faq": [
        (
            "Will the person know I downloaded their story?",
            "No. There is no login and no session, so nothing is added to their viewer list and no notification is sent.",
        ),
        (
            "Can I download a story from a private account?",
            "Not without access to that account. Instagram does not publish a public media URL for private stories, and this tool never asks for a login. If you can already view the story from your account, copy its link and it will work.",
        ),
        (
            "Do highlights work the same way?",
            "Yes. A highlight is just a story that was kept on the profile, so it uses the same link and the same download flow.",
        ),
        (
            "Why does it say the link is not supported?",
            "Usually one of three things: the story has already expired, the account is private, or the link came from a profile page rather than from the story itself. Open the story first, then copy the link from the story menu.",
        ),
        (
            "Does a downloaded story keep its text and stickers?",
            "Yes. Text, stickers, polls and drawings are part of the rendered video, so they appear in the file exactly as they appeared in the app.",
        ),
        (
            "Can I save a story that has already expired?",
            "No. Once Instagram drops the media there is nothing left to fetch. That is why downloading before the 24 hours are up matters.",
        ),
    ],
}


# --------------------------------------------------------------------------
# 3. Photos
# --------------------------------------------------------------------------
PAGES["instagram-photo-downloader"] = {
    "label": "Instagram Photo Downloader",
    "short": "Photos",
    "title": "Instagram Photo Downloader \u2014 Original Resolution JPG | InstaFetch",
    "desc": (
        "Download Instagram photos at the largest resolution Instagram serves, with no watermark "
        "and no screenshot. Paste the post link and save the JPG in seconds. Free, no login."
    ),
    "keywords": (
        "instagram photo downloader, download instagram photos, instagram picture download, "
        "save instagram photo, ig photo download, instagram image downloader"
    ),
    "h1": "Instagram Photo<br />Downloader",
    "badge": "PHOTOS \u2022 ORIGINAL RESOLUTION",
    "steps_label": "3 Simple Steps",
    "howto_h2": "How to Download an Instagram Photo",
    "howto_sub": "Get the file, not a screenshot of the file.",
    "steps": [
        (
            "link",
            "Copy the Post Link",
            "Open the photo, tap the \u22ef menu and choose Copy Link. For a multi-photo post, "
            "any slide's link points at the same post.",
        ),
        (
            "clipboard",
            "Paste It Above",
            "Drop the link into the dock and press Download. InstaFetch resolves the image "
            "Instagram is already serving to the app.",
        ),
        (
            "download",
            "Save the JPG",
            "The photo downloads at full size \u2014 no interface, no compression from a screen "
            "capture, no watermark.",
        ),
    ],
    "body": """
      <h2 class="text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-white mb-4">Instagram photos at the size Instagram serves</h2>
      <p>A screenshot is the worst way to keep an Instagram photo. You capture your screen resolution instead of the image, you get the interface around it, and the phone recompresses the result. Downloading the actual file skips all three problems.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">What &ldquo;original&rdquo; honestly means here</h3>
      <p>Instagram resizes every upload before it publishes it, usually capping the long edge at about 1080 pixels. That resized file is the largest version that exists publicly \u2014 the camera original stays on the creator's phone and is never served to anyone. So &ldquo;original resolution&rdquo; on any downloader means the version Instagram published, not the file that came out of the camera. We give you exactly that, untouched.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Why the download beats a screenshot</h3>
      <p>A download is a byte-for-byte copy of the published JPG: correct dimensions, correct colour, no interface, no extra recompression. A screenshot of a 1080-pixel photo on a 390-pixel-wide phone gives you roughly a third of the detail and a visible quality drop if you ever zoom or print it.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Single photos and multi-photo posts</h3>
      <p>A plain photo post has one image and one link. A multi-photo post is a carousel: up to twenty images and videos in one post, each with its own file. This page handles both \u2014 a carousel simply comes back with one download per slide. If you save carousels often, the carousel page explains the slide-by-slide flow in more detail.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">What this tool does not do</h3>
      <p>It does not fetch profile pictures, and it does not reach private accounts. Profile photos are served through a different endpoint that requires a session, and private media is not public by definition. Everything else \u2014 feed photos, carousel slides, photos inside reels and stories \u2014 is fair game.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Other formats</h3>
      <p>Photos, reels, stories and carousels are stored differently on Instagram's side. Pick the page that matches what you are trying to save:</p>
    """,
    "faq": [
        (
            "Is the downloaded photo the original resolution?",
            "It is the largest version Instagram publishes, which is usually about 1080 pixels on the long edge. The camera original is never served publicly, so no tool can return it.",
        ),
        (
            "Why is a downloaded photo better than a screenshot?",
            "A screenshot captures your screen at screen resolution, includes the interface, and gets recompressed by your phone. The download is the published JPG itself, at full dimensions and full quality.",
        ),
        (
            "Can I download every photo in a carousel post?",
            "Yes. Each slide has its own file and its own download button, numbered in the order the creator posted them.",
        ),
        (
            "What file format do I get?",
            "JPG for photos, which is the format Instagram serves. There is no conversion step, so nothing is lost on the way out.",
        ),
        (
            "Can I download a profile picture?",
            "Not with this tool. Profile photos are served through a different endpoint that requires a logged-in session.",
        ),
        (
            "Does it work on iPhone and Android?",
            "Yes. It runs in the browser, so the photo saves to Photos on iPhone or to Downloads on Android and desktop.",
        ),
    ],
}


# --------------------------------------------------------------------------
# 4. Carousels
# --------------------------------------------------------------------------
PAGES["instagram-carousel-downloader"] = {
    "label": "Instagram Carousel Downloader",
    "short": "Carousels",
    "title": "Instagram Carousel Downloader \u2014 Save Every Slide | InstaFetch",
    "desc": (
        "Download every slide of an Instagram carousel, in order, photos and videos alike. "
        "Paste the post link and save each slide as its own file. Free, no login, no watermark."
    ),
    "keywords": (
        "instagram carousel downloader, download instagram carousel, save instagram album, "
        "instagram multi photo downloader, ig carousel download, instagram slides downloader"
    ),
    "h1": "Instagram Carousel<br />Downloader",
    "badge": "CAROUSELS \u2022 EVERY SLIDE \u2022 IN ORDER",
    "steps_label": "3 Simple Steps",
    "howto_h2": "How to Download an Instagram Carousel",
    "howto_sub": "Every slide, numbered the way the creator posted them.",
    "steps": [
        (
            "link",
            "Copy the Post Link",
            "Open the carousel, tap the \u22ef menu and choose Copy Link. Any slide's link "
            "resolves the whole post.",
        ),
        (
            "clipboard",
            "Paste It Above",
            "Drop the link into the dock and press Download. InstaFetch reads the album and "
            "finds every slide, not just the cover.",
        ),
        (
            "download",
            "Save Slide by Slide",
            "Each slide gets its own numbered button. Tap the ones you want \u2014 photos save "
            "as JPG, video slides as MP4.",
        ),
    ],
    "body": """
      <h2 class="text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-white mb-4">Every slide, in the order it was posted</h2>
      <p>A carousel is one post holding several pieces of media \u2014 up to twenty now, mixing photos and videos freely. Instagram shows them as a swipeable album, and only the cover is visible in the feed. That is exactly why carousels are awkward to save: the interesting slide is usually the fourth one.</p>
      <p>Paste the post link and InstaFetch reads the whole album, then lists each slide as its own numbered download.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Each slide is its own file</h3>
      <p>To be clear about how this works: you get one button per slide, not a zip archive. That is intentional. You can take only the slide you need instead of pulling twenty files you will never open, and you can see each slide's size before saving it. Slide numbers follow the creator's order, so slide 4 here is slide 4 in the app.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Mixed photo and video albums</h3>
      <p>A carousel is not necessarily all photos. Creators mix stills and clips in the same post, and the tool handles both: photo slides download as JPG at Instagram's published resolution, video slides as MP4 with audio. There is no need to run the post twice.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Why the cover looks different</h3>
      <p>The first slide is what Instagram shows in the feed, so it is often a designed cover rather than the content. If you are saving a carousel for reference, the cover is usually the least useful file \u2014 skip it and take the rest.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Quality, honestly</h3>
      <p>Every slide is downloaded exactly as Instagram publishes it, with no recompression and no watermark. Photos cap out around 1080 pixels on the long edge and videos at whatever the creator uploaded \u2014 typically 1080&times;1350 or 1080&times;1080. Nothing is upscaled, because upscaling adds file size without adding detail.</p>

      <h3 class="text-[17px] font-semibold text-white mt-6 mb-2">Other formats</h3>
      <p>Saving something that is not an album? These pages cover the rest:</p>
    """,
    "faq": [
        (
            "Can I download all slides at once?",
            "Each slide has its own download button rather than a single zip, so you choose exactly what you keep. Tapping through a twenty-slide album takes a few seconds.",
        ),
        (
            "Does it keep the original slide order?",
            "Yes. Slides are numbered in the same order the creator posted them, so slide 3 in the tool is slide 3 in Instagram.",
        ),
        (
            "What about video slides inside a carousel?",
            "They download as MP4 with audio. A carousel can mix photos and videos freely, and both types work in the same run.",
        ),
        (
            "How many slides can a carousel have?",
            "Instagram currently allows up to twenty. The tool reads however many the post actually contains, so shorter albums work the same way.",
        ),
        (
            "Does a downloaded slide have a watermark?",
            "No. Instagram does not bake a watermark into carousel media, and nothing is added on the way out.",
        ),
        (
            "Why do my photos look smaller than the ones on my phone?",
            "Because Instagram resizes uploads to roughly 1080 pixels on the long edge before publishing. That resized file is the largest version that exists publicly.",
        ),
    ],
}


ORDER = [
    "instagram-reel-downloader",
    "instagram-story-downloader",
    "instagram-photo-downloader",
    "instagram-carousel-downloader",
]


# --------------------------------------------------------------------------
# Renderers
# --------------------------------------------------------------------------
def _howto_section(page) -> str:
    cards = []
    for i, (icon, title, body) in enumerate(page["steps"], 1):
        cards.append(
            f"""
      <div class="smoked-card rounded-2xl p-6">
        <div class="flex items-center justify-between mb-5">
          <span class="metallic-icon w-11 h-11 rounded-xl flex items-center justify-center text-white/90">
            {ICONS[icon]}
          </span>
          <span class="text-xs font-mono text-white/30">0{i}</span>
        </div>
        <h3 class="text-[17px] font-semibold text-white mb-2">{title}</h3>
        <p class="text-sm text-white/55 leading-relaxed">{body}</p>
      </div>"""
        )
    return f"""  <!-- HOW TO USE SECTION -->
  <section id="how-to-use" class="relative z-20 max-w-[1040px] mx-auto px-4 sm:px-6 pt-12 pb-20">
    <div class="text-center mb-12">
      <span class="quality-pill inline-flex px-3.5 py-1 rounded-full text-[11px] font-medium text-white/75 uppercase mb-4">{page["steps_label"]}</span>
      <h2 class="text-2xl sm:text-4xl font-bold tracking-[-0.03em] text-white">{page["howto_h2"]}</h2>
      <p class="text-sm sm:text-[15px] text-white/55 mt-2.5 max-w-md mx-auto">{page["howto_sub"]}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">{''.join(cards)}
    </div>
  </section>"""


def _faq_section(page) -> str:
    items = []
    for i, (q, a) in enumerate(page["faq"]):
        open_ = i == 0
        items.append(
            f"""
      <div class="smoked-card rounded-2xl overflow-hidden">
        <button type="button" class="faq-toggle w-full px-6 py-4 flex items-center justify-between text-left gap-4 cursor-pointer" aria-expanded="{"true" if open_ else "false"}">
          <span class="text-[15px] font-medium text-white">{q}</span>
          <svg class="faq-chevron w-4 h-4 text-white/60 transition-transform duration-200{" rotate-180" if open_ else ""} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div class="faq-body{" hidden" if not open_ else ""} px-6 pb-5 text-sm text-white/55 leading-relaxed">
          {a}
        </div>
      </div>"""
        )
    return f"""  <!-- FAQ SECTION -->
  <section id="faq" class="relative z-20 max-w-[760px] mx-auto px-4 sm:px-6 pt-12 pb-24">
    <div class="text-center mb-10">
      <h2 class="text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-white">Frequently Asked Questions</h2>
    </div>

    <div class="flex flex-col gap-3" id="faqList">{''.join(items)}
    </div>
  </section>"""


def _related_block(slug: str) -> str:
    links = []
    for other in ORDER:
        if other == slug:
            continue
        page = PAGES[other]
        links.append(
            f"""
        <a href="/{other}" class="smoked-card rounded-2xl p-5 block no-underline hover:border-white/25 transition-colors">
          <span class="block text-[15px] font-semibold text-white mb-1">{page["label"]}</span>
          <span class="block text-xs text-white/50 leading-relaxed">Save {page["short"].lower()} from Instagram in original quality.</span>
        </a>"""
        )
    return f"""
      <div class="mt-10">
        <div class="text-[11px] font-medium uppercase tracking-[0.14em] text-white/35 mb-3">More Instagram downloaders</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">{''.join(links)}
        </div>
      </div>"""


def _body_section(page, slug: str) -> str:
    return f"""  <!-- INTENT CONTENT -->
  <section id="about" class="relative z-20 max-w-[760px] mx-auto px-4 sm:px-6 pt-4 pb-16">
    <div class="flex flex-col gap-4 text-sm sm:text-[15px] text-white/60 leading-relaxed">
{page["body"].rstrip()}
{_related_block(slug)}
    </div>
  </section>"""


def _schema(page, slug: str) -> str:
    url = f"{SITE}/{slug}"
    questions = []
    for q, a in page["faq"]:
        questions.append(
            "            {\n"
            '              "@type": "Question",\n'
            f'              "name": {_json(q)},\n'
            f'              "acceptedAnswer": {{ "@type": "Answer", "text": {_json(a)} }}\n'
            "            }"
        )
    qtext = ",\n".join(questions)
    graph = f"""{{
      "@context": "https://schema.org",
      "@graph": [
        {{
          "@type": "WebApplication",
          "name": {_json(page["label"] + " by Droplabs")},
          "url": {_json(url)},
          "applicationCategory": "MultimediaApplication",
          "operatingSystem": "Any",
          "description": {_json(page["desc"])},
          "offers": {{ "@type": "Offer", "price": "0", "priceCurrency": "USD" }}
        }},
        {{
          "@type": "BreadcrumbList",
          "itemListElement": [
            {{ "@type": "ListItem", "position": 1, "name": "InstaFetch", "item": "{SITE}/" }},
            {{ "@type": "ListItem", "position": 2, "name": {_json(page["label"])}, "item": {_json(url)} }}
          ]
        }},
        {{
          "@type": "FAQPage",
          "mainEntity": [
{qtext}
          ]
        }}
      ]
    }}"""
    return '<script type="application/ld+json">\n' + graph + "\n  </script>"


def _json(value: str) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)


def _sub1(pattern: str, repl: str, text: str, flags: int = 0) -> str:
    """Replace exactly one match; raise if the anchor disappeared.

    The anchors below are the contract between this module and index.html. If
    someone renames a meta tag, a loud failure is better than silently serving
    four pages with the homepage title.
    """
    out, n = re.subn(pattern, lambda m: repl, text, count=1, flags=flags)
    if n != 1:
        raise RuntimeError(f"landing page anchor not found: {pattern[:60]}")
    return out


def render(base: str, slug: str) -> str:
    page = PAGES[slug]
    url = f"{SITE}/{slug}"
    out = base

    out = _sub1(r"<title>.*?</title>", f"<title>{page['title']}</title>", out, re.S)
    out = _sub1(
        r'<meta name="description" content="[^"]*" />',
        f'<meta name="description" content="{page["desc"]}" />',
        out,
    )
    out = _sub1(
        r'<meta name="keywords" content="[^"]*" />',
        f'<meta name="keywords" content="{page["keywords"]}" />',
        out,
    )
    out = _sub1(
        r'<link rel="canonical" href="[^"]*" />',
        f'<link rel="canonical" href="{url}" />',
        out,
    )
    out = _sub1(
        r'<meta property="og:title" content="[^"]*" />',
        f'<meta property="og:title" content="{page["label"]} \u2014 InstaFetch by Droplabs" />',
        out,
    )
    out = _sub1(
        r'<meta property="og:description" content="[^"]*" />',
        f'<meta property="og:description" content="{page["desc"]}" />',
        out,
    )
    out = _sub1(
        r'<meta property="og:url" content="[^"]*" />',
        f'<meta property="og:url" content="{url}" />',
        out,
    )
    out = _sub1(
        r'<meta name="twitter:title" content="[^"]*" />',
        f'<meta name="twitter:title" content="{page["label"]} \u2014 InstaFetch" />',
        out,
    )
    out = _sub1(
        r'<meta name="twitter:description" content="[^"]*" />',
        f'<meta name="twitter:description" content="{page["desc"]}" />',
        out,
    )
    out = _sub1(
        r'<script type="application/ld\+json">.*?</script>',
        _schema(page, slug),
        out,
        re.S,
    )
    out = _sub1(
        r'<h1 class="hero-headline[^"]*">.*?</h1>',
        f'<h1 class="hero-headline text-[34px] sm:text-[54px] md:text-[62px] font-bold text-white max-w-[780px] mb-8 sm:mb-12">{page["h1"]}</h1>',
        out,
        re.S,
    )
    out = _sub1(
        r'(<div class="hero-badge[^"]*">)[^<]*(</div>)',
        f'<div class="hero-badge quality-pill inline-flex items-center px-4 py-1.5 rounded-full text-[11px] sm:text-[12px] font-medium text-white/85 uppercase mb-6 sm:mb-7">{page["badge"]}</div>',
        out,
    )

    out = _between(out, "HOWTO", _howto_section(page))
    out = _between(out, "FAQ", _faq_section(page))
    out = out.replace("<!--LANDING:BODY-->", _body_section(page, slug), 1)

    return strip_markers(out)


def _between(html: str, name: str, replacement: str) -> str:
    pattern = re.compile(
        rf"<!--LANDING:{name}-->.*?<!--/LANDING:{name}-->", re.S
    )
    out, n = pattern.subn(lambda m: replacement, html, count=1)
    if n != 1:
        raise RuntimeError(f"landing block not found: {name}")
    return out


_MARKER = re.compile(r"<!--/?LANDING:[A-Z]+-->")


def strip_markers(html: str) -> str:
    return _MARKER.sub("", html)


# Standalone tool pages that are not Instagram landing pages. Each one is its
# own hand-written document in static/, so it only needs to be listed here.
TOOL_URLS = [
    ("/tools/video-downloader", "0.95"),
    ("/tools/video-to-text", "0.95"),
    ("/tools/image-compressor", "0.95"),
    ("/image-compressor", "0.8"),
]


def sitemap_urls():
    """(path, priority) pairs, homepage first."""
    urls = [("/", "1.0")]
    urls += [(f"/{slug}", "0.9") for slug in ORDER]
    urls += TOOL_URLS
    return urls
