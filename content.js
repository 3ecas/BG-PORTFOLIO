/* ==========================================================================
   CONTENT — this is the only file you need to edit.

   Everything on the site (name, hero reel, projects, about, contact) is read
   from the object below. Save the file and refresh the page.

   Paths are relative to index.html, e.g. "media/my-project/video.mp4".
   Run `bash tools/encode.sh "<your videos folder>"` to create the video,
   preview and poster for every project in one go, plus ready-to-paste
   blocks for the list below (see README.md).

   All projects, clients and credits below are fictional samples.
   ========================================================================== */

window.PORTFOLIO = {
  site: {
    name: "BG",                               // short name / monogram in the nav
    role: "Motion Designer",
    email: "hello@example.com",
    available: true,                          // green dot on; set false for a grey dot
    availability: "Booking projects from November 2026",
    location: "Remote, worldwide",
    timezone: "UTC",                          // IANA name, e.g. "Europe/Lisbon", "America/New_York"
    fps: 25,                                  // default frame rate for timecodes
    theme: "dark",                            // "dark", "light" or "auto" (follows the visitor's OS)
    socials: [
      { label: "Instagram", url: "https://www.instagram.com/" },
      { label: "Vimeo", url: "https://vimeo.com/" },
      { label: "Behance", url: "https://www.behance.net/" },
      { label: "LinkedIn", url: "https://www.linkedin.com/" }
    ]
  },

  hero: {
    // Big kinetic title. One entry per line. Keep lines short (4–10 letters).
    title: ["Motion", "Designer"],
    intro: "I design and animate brand systems, title sequences and social-first campaigns for studios and brands worldwide.",
    reel: {
      title: "Showreel",
      year: 2026,
      video: "media/reel/reel.mp4",                   // muted loop behind the hero (16:9)
      videoVertical: "media/reel/reel-vertical.mp4",  // optional: used on phones held upright (9:16)
      poster: "media/reel/poster.jpg",
      posterVertical: "media/reel/poster-vertical.jpg",
      full: "",            // optional: longer cut with sound for the "Play showreel" button
      fullVertical: "",    // optional: the same for phones held upright
      duration: "0:17",           // length of what "Play showreel" plays (full, or video if no full)
      durationVertical: "0:12",   // the same on phones held upright
      fps: 30
    }
  },

  // Words that scroll across the band between the highlights and the grid.
  marquee: ["Brand motion", "Title sequences", "3D & CGI", "Social-first", "Kinetic type", "Explainers"],

  // Slugs of the projects shown in the horizontal "Selected work" reel, in order.
  // Leave empty to use every project marked `featured: true`.
  highlights: ["signal-bloom", "drop-04", "tideline", "night-bloom", "say-it-louder"],

  /* ------------------------------------------------------------------------
     PROJECTS — shown in the grid in this order.

     Required: title, format, video (or vimeo / youtube)
     format:      "16:9" or "9:16" (any ratio such as "4:5" or "1:1" also works)
     video:       full video that plays in the project viewer
     preview:     optional short, light, muted loop for hover previews
                  (falls back to `video`)
     poster:      still image shown before anything plays
     vimeo:       optional Vimeo ID or link (unlisted links work too); when set,
                  the viewer plays it instead of `video`
     youtube:     optional YouTube ID or link; when set, the viewer plays it
                  instead of `video`
     duration:    "m:ss", shown on thumbnails
     fps:         frame rate for the viewer's timecode
     color:       dominant color, painted while the poster loads
     categories:  filter chips are built from these automatically
     links:       optional [{ label: "Case study", url: "https://..." }]
     hidden:      true keeps a project in the file but off the site
     slug:        the link name (yoursite/#slug); must be unique and not one of
                  top, highlights, work, about, contact
     ------------------------------------------------------------------------ */
  projects: [
    {
      slug: "signal-bloom",
      title: "Signal Bloom",
      client: "Halden Audio",
      year: 2026,
      format: "16:9",
      categories: ["Brand", "3D"],
      featured: true,
      video: "media/signal-bloom/video.mp4",
      poster: "media/signal-bloom/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#111950",
      summary: "A sonic logo made visible. Particles gather into the Halden ring on the downbeat and scatter on the tail.",
      description: [
        "Halden needed an ident that could live everywhere their sound does: launch films, product pages and the start-up chime in the headphones' companion app.",
        "The mark is a particle system driven by the audio logo itself, so the ring always forms on the beat. One simulation was cut into a 10-second hero, 3-second stings and a looping idle state."
      ],
      role: "Direction, design, animation",
      tools: ["Houdini", "Redshift", "After Effects"],
      credits: [
        { role: "Sound design", name: "Arcos Audio" },
        { role: "Agency", name: "North & Field" }
      ]
    },
    {
      slug: "drop-04",
      title: "Drop 04",
      client: "Strider Footwear",
      year: 2026,
      format: "9:16",
      categories: ["Social", "Typography"],
      featured: true,
      video: "media/drop-04/video.mp4",
      poster: "media/drop-04/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#ff5a14",
      summary: "Launch loop for a limited sneaker drop, cut to the beat for Stories and Reels.",
      description: [
        "Eight seconds, sound off by default, one job: make people stop scrolling. Every shape hits on a kick drum so the loop still reads as rhythmic with the sound muted.",
        "Delivered as a system of templates so the in-house team could version it for the next six drops."
      ],
      role: "Design, animation",
      tools: ["After Effects", "Illustrator"],
      credits: [{ role: "Creative direction", name: "Strider in-house" }]
    },
    {
      slug: "mercury",
      title: "Mercury",
      client: "Solune Skincare",
      year: 2026,
      format: "16:9",
      categories: ["3D", "Brand"],
      video: "media/mercury/video.mp4",
      poster: "media/mercury/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#a19dc8",
      summary: "Liquid chrome textures for a serum launch, used across film, web and retail screens.",
      description: [
        "A library of slow, glossy liquid loops that sit behind product shots and type. Rendered at 4K so retail could crop freely for vertical screens."
      ],
      role: "Look development, animation",
      tools: ["Cinema 4D", "Octane", "After Effects"],
      credits: [{ role: "Agency", name: "Maison Pale" }]
    },
    {
      slug: "night-bloom",
      title: "Night Bloom",
      client: "Solune Skincare",
      year: 2026,
      format: "9:16",
      categories: ["Social", "3D"],
      featured: true,
      video: "media/night-bloom/video.mp4",
      poster: "media/night-bloom/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#5d1f40",
      summary: "A flower that opens over eight seconds, for the night-cream campaign on Stories.",
      description: [
        "Translucent petals built as layered gradients, so the piece stays soft and readable on small screens. New rings of petals keep opening from the centre, so the loop never shows a seam."
      ],
      role: "Design, 3D, animation",
      tools: ["Blender", "After Effects"],
      credits: [{ role: "Agency", name: "Maison Pale" }]
    },
    {
      slug: "say-it-louder",
      title: "Say It Louder",
      client: "Parade Radio",
      year: 2025,
      format: "16:9",
      categories: ["Typography", "Brand"],
      featured: true,
      video: "media/say-it-louder/video.mp4",
      poster: "media/say-it-louder/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#f4ecdc",
      summary: "Kinetic type rebrand for an independent radio station. Every word is set in time with the voice-over.",
      description: [
        "The station's new line is a single instruction, so the motion system does one thing: it gets louder. Type scales, slams and wipes on a 120 bpm grid that every future spot can reuse.",
        "Built as an After Effects rig with sliders for word count, tempo and palette."
      ],
      role: "Motion system, typography",
      tools: ["After Effects", "Figma"],
      credits: [
        { role: "Brand identity", name: "Studio Loud Hands" },
        { role: "Voice", name: "Parade Radio" }
      ]
    },
    {
      slug: "stack",
      title: "Stack",
      client: "Ledgerly",
      year: 2025,
      format: "9:16",
      categories: ["Social", "Explainer"],
      video: "media/stack/video.mp4",
      poster: "media/stack/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#e7ddf7",
      summary: "Product UI animation showing how savings pots stack up, cut for app-store previews and paid social.",
      description: [
        "Springs, not keyframes: every card uses the same physics settings as the app, so the ad feels like the product."
      ],
      role: "UI animation",
      tools: ["After Effects", "Figma", "Rive"],
      credits: [{ role: "Product design", name: "Ledgerly design team" }]
    },
    {
      slug: "tideline",
      title: "Tideline",
      client: "Northshore Documentary Festival",
      year: 2025,
      format: "16:9",
      categories: ["Titles"],
      featured: true,
      video: "media/tideline/video.mp4",
      poster: "media/tideline/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#0c2c31",
      summary: "Opening titles for a festival about coastlines, built from forty contour lines that breathe like tide.",
      description: [
        "The festival's theme was change you can only see over time. The titles move slowly on purpose: each line is offset by a few frames, so the whole field drifts like water.",
        "Ran before every screening across nine days."
      ],
      role: "Title design, animation",
      tools: ["After Effects", "Cinema 4D"],
      credits: [
        { role: "Music", name: "Hollow Bay" },
        { role: "Festival identity", name: "Coastal Office" }
      ]
    },
    {
      slug: "lineup-reveal",
      title: "Lineup Reveal",
      client: "Nightjar Festival",
      year: 2025,
      format: "9:16",
      categories: ["Social", "Typography"],
      video: "media/lineup-reveal/video.mp4",
      poster: "media/lineup-reveal/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#06070a",
      summary: "Countdown and lineup reveal for a summer festival, posted as a three-part Story sequence.",
      description: [
        "A strobing countdown that hands over to the lineup poster. Built so names could be swapped the night before the announcement without re-rendering the whole piece."
      ],
      role: "Design, animation",
      tools: ["After Effects", "Cinema 4D"],
      credits: [{ role: "Festival identity", name: "Nightjar studio" }]
    },
    {
      slug: "halftone-weather",
      title: "Halftone Weather",
      client: "Meridian Weather",
      year: 2024,
      format: "16:9",
      categories: ["Explainer", "Brand"],
      video: "media/halftone-weather/video.mp4",
      poster: "media/halftone-weather/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#d7dfea",
      summary: "Explainer system that turns pressure maps into halftone patterns for a weather app's new forecasts.",
      description: [
        "Weather data is noisy, so the visual language is calm: one grid of dots that grows and shrinks with pressure and wind. The same grid became the app's loading states."
      ],
      role: "Art direction, animation",
      tools: ["After Effects", "TouchDesigner"],
      credits: [{ role: "Script", name: "Meridian content team" }]
    },
    {
      slug: "orbit",
      title: "Orbit",
      client: "Kestrel Mobility",
      year: 2024,
      format: "16:9",
      categories: ["3D", "Brand"],
      video: "media/orbit/video.mp4",
      poster: "media/orbit/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#26282b",
      summary: "Launch teaser for an e-bike hub motor, told entirely through a rotating point cloud.",
      description: [
        "The product wasn't ready to be shown, so the teaser shows how it moves instead: a chrome point cloud turning on a studio turntable, lit by the brand's lime."
      ],
      role: "3D, animation",
      tools: ["Houdini", "Redshift"],
      credits: [{ role: "Agency", name: "Crosswind" }]
    },
    {
      slug: "ribbon",
      title: "Ribbon",
      client: "Personal",
      year: 2024,
      format: "9:16",
      categories: ["3D", "Personal"],
      video: "media/ribbon/video.mp4",
      poster: "media/ribbon/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#1a2734",
      summary: "A study in loops: one ribbon, one twist, no cuts.",
      description: [
        "A personal experiment in making a perfect loop without hiding the seam: one ribbon tied in a trefoil knot, turning once every eight seconds."
      ],
      role: "Everything",
      tools: ["Blender"],
      credits: []
    },
    {
      slug: "blocktown",
      title: "Blocktown",
      client: "Carrow Freight",
      year: 2023,
      format: "16:9",
      categories: ["Explainer", "3D"],
      video: "media/blocktown/video.mp4",
      poster: "media/blocktown/poster.jpg",
      duration: "0:08",
      fps: 30,
      color: "#ece0cc",
      summary: "Isometric explainer about same-day delivery, from warehouse to doorstep in one continuous shot.",
      description: [
        "One camera move, no cuts. The city rises and falls around the parcel so the viewer never loses track of it."
      ],
      role: "Design, animation",
      tools: ["Cinema 4D", "After Effects"],
      credits: [
        { role: "Script", name: "Carrow marketing" },
        { role: "Sound", name: "Arcos Audio" }
      ]
    }
  ],

  about: {
    // Large statement. Words light up one by one as it scrolls into view.
    statement: "I make brands move with purpose. Every frame is designed, every curve is eased by hand, and every loop ends where it began.",
    bio: [
      "I'm a motion designer working across 2D, 3D and typography. I lead projects from the first styleframe to the final render, and I'm just as comfortable joining a studio team for a busy month.",
      "Most of my work lives on phones, so I design for vertical and horizontal from day one instead of cropping at the end."
    ],
    portrait: "",   // optional: "media/portrait.jpg"
    services: ["Brand motion systems", "Title sequences", "3D & product animation", "Social-first campaigns", "Kinetic typography", "UI & product motion"],
    tools: ["After Effects", "Cinema 4D", "Houdini", "Blender", "Redshift", "Figma", "Premiere Pro", "DaVinci Resolve"],
    clients: ["Halden Audio", "Solune Skincare", "Parade Radio", "Strider Footwear", "Northshore Doc Fest", "Ledgerly", "Kestrel Mobility", "Carrow Freight"]
  },

  contact: {
    title: ["Let's make", "it move"],
    note: "Tell me about the project, the deadline and where it will live. I reply within two working days."
  }
};
