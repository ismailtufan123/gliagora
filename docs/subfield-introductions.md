# Subfield introductions: AI drafts (D53)

First drafts of the English introductions of the 19 subfield hubs (PLAN §4.2, §16.3), written on 2026-10-17 with an AI assistant (Claude Code) from the taxonomy alone: no personal data, no sources, no names of people or laboratories, and no medical advice (D19). Each is 170–250 words; a hub is indexed once its introduction has at least 150 (D40), so there is room to shorten.

The site never shows these drafts. A migration copies each into its subfield's field "AI draft of the introduction" in the admin (Taxonomy → Terms), which only editors see. The hub shows, and search engines count, only "Hub introduction", which stays empty until the editor writes her own introduction from the draft and saves it (`docs/editor-guide-tr.md`, section 7).

Generated from `src/migrations/data/subfield-introductions-2026-10.ts`; a test checks that the two agree (`WRITE_DOC=1 pnpm vitest run src/migrations/data/subfield-introductions-2026-10.test.ts` rewrites this file).

## Molecular and cellular

`molecular-cellular`, 202 words

Molecular and cellular neuroscience asks how the parts of a nerve cell work and how they work together. It studies the proteins, membranes and organelles that let neurons receive signals, fire and stay alive: ion channels and receptors, the signalling pathways inside the cell, the transport of proteins and mitochondria along axons, and the way cells build, maintain and recycle their own components.

Typical questions include how a channel opens and closes, how a signal at the membrane reaches the nucleus and changes which genes are read, and how a cell copes with stress or damage. The methods are those of cell biology and biochemistry: cultured neurons and brain slices, live-cell imaging, patch-clamp recordings, protein biochemistry, structural biology, gene editing and the omics techniques. A project may combine several of these with the analysis of large imaging or sequencing data sets.

Positions in this field include PhD projects and postdoctoral posts in biology, neuroscience and medical faculties, research technician and research assistant roles that run imaging or molecular work, staff scientist posts at core facilities, faculty and group leader posts for experienced researchers, and posts in pharmaceutical and biotechnology companies. Related hubs: Synapses and plasticity, Glial biology, Neurogenetics and genomics, and Neuropharmacology.

## Synapses and plasticity

`synapses-plasticity`, 200 words

This field studies the synapse, the contact where one nerve cell passes a signal to the next, and the ways synapses change with use. It covers how neurotransmitters are released and detected, how synapses form and are removed, and how their strength rises or falls over seconds, hours or a lifetime: long-term potentiation and depression, homeostatic plasticity and structural changes of dendritic spines.

Researchers ask how a synapse stores a change, how activity leaves a lasting trace that may underlie learning and memory, and how a network keeps its activity in a working range while its connections change. The work combines electrophysiology in brain slices and in living animals, high-resolution and live imaging, the molecular biology of synaptic proteins, optogenetics, and computational models of plasticity rules. Some groups also study how synapses are affected in disorders of the nervous system, as a step towards understanding those disorders.

Typical openings are PhD studentships and postdoctoral fellowships in physiology, pharmacology and neuroscience departments, research associate posts in electrophysiology or imaging, faculty and group leader posts for experienced researchers, and roles in companies that develop drugs acting on synaptic targets. Related hubs: Molecular and cellular, Systems and circuits, Cognitive, and Computational and theoretical.

## Glial biology

`glia`, 205 words

Glial cells live alongside neurons throughout the nervous system, and glial biology studies what they do. Astrocytes take up neurotransmitters, supply energy and shape synapses; microglia survey the tissue and remove debris and unused connections; oligodendrocytes and Schwann cells wrap axons in myelin, which speeds the signals along them. The field asks how these cells talk to neurons and to each other, and how they change during development, ageing and disease.

Typical questions include how astrocytes sense and respond to neuronal activity, how microglia decide which synapses to remove, how myelin is made and repaired, and how glia take part in inflammation and recovery after injury. Methods range from calcium imaging of astrocytes and genetic labelling of cell types to single-cell transcriptomics, cell culture and organoids, electron microscopy of myelin and imaging in living animals. Glia are also studied in other species, from flies to fish, where their roles can be followed in a whole living animal.

The field offers PhD and postdoctoral positions in neuroscience, cell biology and immunology groups, technician posts in imaging and tissue work, faculty and group leader posts, and industry roles in companies working on neuroinflammation or myelin repair. Related hubs: Neuroimmunology, Molecular and cellular, Synapses and plasticity, and Developmental.

## Neurogenetics and genomics

`neurogenetics`, 206 words

Neurogenetics and genomics study how genes and their regulation shape the nervous system and behaviour. The field covers the genetic variation that raises or lowers the risk of brain disorders, the control of gene expression in neurons and glia, the epigenetic marks that respond to experience, and atlases that describe the cell types of the brain by the genes they use.

Researchers ask which genes and variants matter for a trait, how a variant changes the way a cell behaves, and how gene regulation differs between cell types, brain regions and species. The methods include genome and transcriptome sequencing, single-cell and spatial omics, genome-wide association studies, CRISPR screens and gene editing in cells and model organisms, and the statistics and computing needed to analyse large data sets. A project may span a wet laboratory and a computational group, or be part of a consortium that shares its data openly.

Positions include PhD projects and postdoctoral posts in genetics, genomics and neuroscience institutes, bioinformatician and data scientist roles in sequencing centres and research consortia, faculty and group leader posts for experienced researchers, and posts in biotechnology and pharmaceutical companies that work on genetic targets. Related hubs: Molecular and cellular, Developmental, Clinical and translational, and Evolutionary and comparative.

## Developmental

`developmental`, 199 words

Developmental neuroscience follows the nervous system as it is built, from the first neural cells in the embryo to the mature brain. It studies how stem and progenitor cells divide and choose their fate, how young neurons migrate to their places, how axons find their targets, how synapses form and are pruned, and how experience refines circuits during critical periods.

Typical questions are how a cell knows what to become, which signals guide a growing axon, why some periods of life are especially open to change, and how disturbances early in life affect the adult brain. Researchers use embryos and young animals of several species, neurons grown from stem cells and brain organoids, time-lapse imaging, genetic lineage tracing, single-cell sequencing and electrophysiology. Work in this field also asks how the developing brain is shaped by its environment, from nutrition to sensory experience.

The field offers PhD and postdoctoral positions in developmental biology, neuroscience and stem-cell institutes, research assistant and technician roles in imaging, embryology or organoid work, faculty and group leader posts for experienced researchers, and posts in companies that build models from stem cells. Related hubs: Molecular and cellular, Neurogenetics and genomics, Glial biology, and Evolutionary and comparative.

## Systems and circuits

`systems-circuits`, 197 words

Systems and circuits neuroscience studies how groups of connected neurons produce activity that carries information and drives behaviour. It covers circuit dynamics, the way populations of neurons represent the world, how brain regions communicate, and how the wiring diagram of a circuit, its connectome, shapes what the circuit can do. Work spans many species, from flies and fish to rodents, birds and primates.

Researchers ask how a circuit turns sensory input into a decision or a movement, how activity patterns such as oscillations coordinate regions, which cell types play which part, and how circuits adapt when an animal learns. Typical methods are large-scale electrophysiology with high-density probes, two-photon and widefield imaging, optogenetic and chemogenetic manipulation, anatomical tracing and connectomics, behavioural experiments in rodents and other species, and the analysis of large neural recordings.

Positions include PhD studentships and postdoctoral posts in neuroscience institutes and university departments, research engineer and software roles that build recording systems or analysis pipelines, faculty and group leader posts for experienced researchers, and posts in neurotechnology and AI companies. Programming and data analysis are useful skills across these roles. Related hubs: Sensory systems, Motor systems, Cognitive, Computational and theoretical, and Neurotechnology and BCI.

## Sensory systems

`sensory`, 197 words

Sensory neuroscience studies how the nervous system detects and interprets the world: vision, hearing, touch, smell, taste, balance and the sense of the body's own position, as well as pain. It follows signals from receptor cells in the eye, ear, skin or nose through the spinal cord and brainstem to the cortex, and asks how each stage transforms them.

Typical questions are how receptors turn light, sound or chemicals into electrical signals, how the brain separates an object from its background, how attention and expectation change what we perceive, how pain signals arise and are modulated, and whether one sense can take over areas of the brain when another is missing. The methods range from single-cell recordings and imaging in the retina or cortex to psychophysics with human participants, EEG, MEG and fMRI, and computational models of perception.

The field offers PhD and postdoctoral posts in neuroscience, psychology, vision science, hearing science and engineering departments, research roles in companies that work on hearing devices, vision and displays, faculty and group leader posts for experienced researchers, and posts in pain research in universities and industry. Related hubs: Systems and circuits, Cognitive, Computational and theoretical, and Neurotechnology and BCI.

## Motor systems

`motor`, 195 words

Motor neuroscience studies how the nervous system plans and controls movement, from reaching and walking to speech and eye movements. It covers the motor cortex, the basal ganglia, the cerebellum, the brainstem and the circuits of the spinal cord that coordinate muscles, and how practice turns a clumsy movement into a skilled one.

Researchers ask how the brain chooses one action among many, how it corrects errors while a movement unfolds, how motor skills are learned and stored, and how circuits reorganise after an injury. The methods include recordings and imaging in moving animals, motion capture and electromyography, behavioural tasks and brain stimulation with human participants, studies of spinal circuits, and models from control theory and robotics. Some laboratories also study how the motor system ages, and what limits recovery after a stroke or a spinal cord injury.

Typical openings are PhD and postdoctoral positions in neuroscience, physiology, movement science, rehabilitation and engineering departments, research engineer roles in laboratories that build movement-tracking or neuroprosthetic systems, faculty and group leader posts for experienced researchers, and posts in neurotechnology and rehabilitation-robotics companies. Related hubs: Systems and circuits, Neurotechnology and BCI, Clinical and translational, and Computational and theoretical.

## Cognitive

`cognitive`, 197 words

Cognitive neuroscience studies the brain basis of the mind: attention, perception, memory, decision-making, language, reasoning and the control of behaviour. It links what people and animals do in carefully designed tasks to what happens in their brains while they do it, and asks how these abilities develop in childhood and change with age. It shares many of its questions with psychology, linguistics, philosophy and computer science.

Typical questions are how we hold information in mind for a few seconds, how memories are formed and recalled, how choices weigh rewards against costs, and how language is understood and produced. Researchers work with human participants using fMRI, EEG, MEG, brain stimulation and behavioural experiments, with patients who take part in research studies, and with animals trained on comparable tasks; computational models of cognition connect these levels of description.

The field offers PhD and postdoctoral positions in psychology, neuroscience and cognitive science departments, research assistant posts that run imaging or behavioural studies, data and research scientist roles in technology and AI companies, faculty and group leader posts for experienced researchers, and posts in education research. Related hubs: Affective and social, Systems and circuits, Computational and theoretical, and Behavioural and neuroethology.

## Affective and social

`affective-social`, 195 words

Affective and social neuroscience studies emotion, motivation and social life in the brain. It covers how we feel fear, pleasure and stress, how rewards and punishments shape what we seek and avoid, and how we recognise others, understand their intentions, form bonds, cooperate and compete. It also asks how these processes differ between individuals and change across life.

Researchers ask which circuits produce an emotional state and how that state influences memory and decisions, how motivation is regulated, how the body's state, such as hunger or stress hormones, colours feelings, how social signals such as faces and voices are processed, and how early social experience shapes the adult brain. The methods range from neural recordings and circuit manipulations in rodents, birds and primates to human studies with fMRI, physiological measures and economic or social games, and computational models of learning from reward.

Typical positions are PhD and postdoctoral posts in neuroscience, psychology and psychiatry departments, research assistant roles that run behavioural or imaging studies, faculty and group leader posts for experienced researchers, and research posts in organisations that work on mental health or wellbeing. Related hubs: Cognitive, Behavioural and neuroethology, Clinical and translational, and Neuropharmacology.

## Behavioural and neuroethology

`behavioral`, 197 words

Behavioural neuroscience and neuroethology study behaviour itself, often as animals produce it in natural settings, and the nervous systems behind it. The field ranges from song learning in birds and navigation in insects to foraging, courtship and social interaction in mammals, and asks how evolution has shaped brains to solve the problems each species meets.

Typical questions are how an animal learns from experience, how it chooses where to go and what to do next, how innate behaviours are wired into the nervous system, and how individuals of the same species come to behave differently. Researchers combine careful observation with modern tools: video tracking and pose estimation by machine learning, virtual-reality setups, wireless neural recordings in freely moving animals, genetic tools in model species, and studies in the field. Experiments may run for days or weeks with automated tracking.

The field offers PhD and postdoctoral positions in biology, zoology, psychology and neuroscience departments, research technician posts in animal behaviour facilities, roles that build tracking and analysis software, faculty and group leader posts for experienced researchers, and roles at field stations and in conservation research. Related hubs: Evolutionary and comparative, Affective and social, Cognitive, and Systems and circuits.

## Computational and theoretical

`computational-theoretical`, 194 words

Computational and theoretical neuroscience uses mathematics, simulation and data analysis to understand how the nervous system works. It builds models of single neurons, synapses, circuits and whole behaviours, develops theories of how the brain represents and computes, and draws on and contributes to machine learning, where artificial neural networks serve both as a tool and as a point of comparison, an area often called NeuroAI.

Researchers ask what computations a circuit performs, which learning rules could explain the plasticity seen in experiments, how noise and limited energy shape neural codes, and how to find structure in large recordings. The work uses dynamical systems, probability and statistics, information theory, deep learning and large-scale simulation, often in close collaboration with experimental laboratories. Projects range from pen-and-paper theory to the analysis of data from thousands of neurons recorded at once.

Positions include PhD and postdoctoral posts in neuroscience, physics, mathematics, computer science and engineering departments, research software engineer and data scientist roles in research institutes and consortia, faculty and group leader posts for experienced researchers, and research scientist posts in AI and neurotechnology companies. Related hubs: Systems and circuits, Cognitive, Synapses and plasticity, and Neurotechnology and BCI.

## Integrative physiology

`integrative-physiology`, 197 words

Integrative physiology studies how the nervous system regulates the body as a whole. It covers sleep and wakefulness, circadian rhythms, the hypothalamus and the hormones it controls, the autonomic nervous system that governs the heart, breathing and digestion, and the signals that link the brain with the gut, the immune system and metabolism.

Typical questions are why we sleep and what happens in the brain during sleep, how internal clocks keep time and adjust to light and meals, how shifted schedules, as in shift work or jet lag, affect those clocks, how the brain senses hunger, thirst and temperature, and how stress responses are switched on and off. Researchers combine neural recordings and imaging with measures of hormones, metabolism and body physiology, genetic tools in model organisms, sleep and chronobiology studies with human volunteers, and long-term monitoring.

The field offers PhD and postdoctoral positions in physiology, neuroscience, endocrinology and sleep research groups, technician posts in physiology and sleep laboratories, research posts in clinical sleep and metabolism studies, faculty and group leader posts for experienced researchers, and roles in companies working on sleep, metabolism and wearable monitoring. Related hubs: Neuroimmunology, Neuropharmacology, Affective and social, and Clinical and translational.

## Neuroimmunology

`neuroimmunology`, 194 words

Neuroimmunology studies how the nervous and immune systems interact. It covers inflammation in the brain and spinal cord, the brain's own immune cells such as microglia, the barriers that separate the brain from the blood, and the ways in which immune signals change neurons, behaviour and recovery after injury or infection.

Researchers ask how immune cells enter or stay out of the nervous system, how inflammation contributes to neurological and psychiatric conditions, how nerves in turn regulate immunity, how signals from the gut and its microbes reach the brain, and when an immune response protects nerve tissue or harms it. The work uses methods of immunology, such as flow cytometry and cytokine measurements, alongside imaging, single-cell sequencing, animal models, human tissue and samples from research cohorts. Some projects follow research participants over years to learn how inflammation and nerve damage relate.

Typical positions are PhD and postdoctoral posts in immunology, neuroscience and neurology research groups, faculty and group leader posts for experienced researchers, research scientist roles in pharmaceutical and biotechnology companies working on immune targets, and technician posts in cell and tissue laboratories. Related hubs: Glial biology, Clinical and translational, Integrative physiology, and Neuropharmacology.

## Neuropharmacology

`neuropharmacology`, 191 words

Neuropharmacology studies how drugs and other chemical substances act on the nervous system. It covers receptors and the molecules that bind to them, how a compound reaches the brain and how long it stays there, its effects on cells, circuits and behaviour, and the mechanisms of tolerance and dependence. It also studies substances that the body makes itself, such as neuropeptides and hormones.

Researchers ask which receptor or pathway a compound acts on, why the same substance has wanted effects in one setting and unwanted effects in another, how genetic differences between people change the response to a compound, and how new molecules can be designed to act more selectively. The methods include receptor binding and signalling assays, electrophysiology, behavioural pharmacology in animal models, imaging with radioactive tracers, medicinal chemistry, and computational approaches to drug design.

The field offers PhD and postdoctoral positions in pharmacology, pharmacy and neuroscience departments, faculty and group leader posts for experienced researchers, and a range of roles in pharmaceutical, biotechnology and contract research companies, from laboratory scientist to project management and regulatory affairs. Related hubs: Molecular and cellular, Synapses and plasticity, Clinical and translational, and Neuroimmunology.

## Clinical and translational

`clinical-translational`, 197 words

Clinical and translational neuroscience connects laboratory research with the study of disorders of the nervous system in people. It covers research in neurology, psychiatry and neurosurgery, the search for biomarkers that measure a disease process, and the path by which findings from cells and model organisms are tested in clinical studies. It depends on close work between clinicians, laboratory scientists, statisticians and the people who take part in studies.

Typical questions are what changes in the brain as a disorder begins and progresses, which measures in blood, imaging or recordings can track it, and whether an intervention works in a controlled study. Researchers use brain imaging, electrophysiology, genetics, cohort studies and biobanks, clinical trials, and samples from patients who have agreed to take part in research. This hub is about research and research careers; it gives no medical advice.

Positions include PhD and postdoctoral posts in university hospitals and medical schools, clinical research fellowships for doctors and other health professionals, study coordinator and research nurse roles, data scientist and statistician posts, academic posts that combine research with clinical work, and roles in pharmaceutical and medical-device companies. Related hubs: Neuroimmunology, Neuropharmacology, Neurogenetics and genomics, and Neurotechnology and BCI.

## Neurotechnology and BCI

`neurotechnology-bci`, 200 words

Neurotechnology develops devices that record from or act on the nervous system, and brain–computer interfaces (BCIs) use such recordings to control computers, prostheses or other machines. The field covers electrodes and implants, non-invasive recording such as EEG, neuromodulation devices that stimulate nerves or brain regions, and the software that decodes neural signals. Some devices are used only in research, others are tested in clinical studies, and consumer products such as headsets raise questions of their own.

Researchers ask how to record from more neurons for longer and with less damage, how to decode intended movements or speech from neural activity, how stimulation changes circuits, and how devices can be made safe, reliable and easy to use. The work brings together electrical and biomedical engineering, materials science, signal processing and machine learning, neuroscience experiments, and studies with human participants under the approvals that clinical research requires.

The field offers PhD and postdoctoral positions in engineering and neuroscience departments, research engineer and embedded software roles, faculty posts in engineering and neuroscience, posts in start-ups and established medical-device companies, and roles in regulatory affairs and clinical studies. Related hubs: Systems and circuits, Motor systems, Computational and theoretical, and Neuroethics, education and society.

## Evolutionary and comparative

`evolutionary-comparative`, 203 words

Evolutionary and comparative neuroscience studies how nervous systems differ across species and how they came to be the way they are. It compares brains from invertebrates to primates, traces the origins of cell types and brain regions, and asks which features are shared by many animals and which belong to only a few. It also asks how animals without a brain, such as jellyfish, use their nerve nets.

Typical questions are how new cell types and circuits evolve, why the size and structure of brains vary between species, how similar behaviours arise in distant lineages, and what model organisms can and cannot tell us about the human brain. Researchers use comparative anatomy and imaging, single-cell sequencing across species, genomics, studies of development, observations of behaviour in the field and the laboratory, and phylogenetic methods. Fossil skulls, ancient DNA and the brains of rarely studied species all have a place in this work.

Positions include PhD and postdoctoral posts in zoology, evolutionary biology, anthropology and neuroscience departments, faculty and group leader posts for experienced researchers, roles at natural history museums and field stations, and technician and data posts in comparative genomics projects. Related hubs: Behavioural and neuroethology, Developmental, Neurogenetics and genomics, and Sensory systems.

## Neuroethics, education and society

`neuroethics-society`, 192 words

This hub gathers work on neuroscience and society: the ethics of brain research and neurotechnology, the teaching and communication of neuroscience, its history, and its place in law and policy. It asks what neuroscience means for questions of privacy, responsibility and identity, and how research is shared with the public. It brings together scientists, philosophers, lawyers, historians, teachers and the public.

Typical questions are how consent should work for brain data and implants, how new findings can be explained without overstating them, how neuroscience is used in courtrooms, classrooms and policy, how fairly new neurotechnologies are shared, and how the field's own past shapes its practices today. The methods come from philosophy, law, history, the social sciences and education research: case studies, interviews and surveys, the analysis of documents, and the design and evaluation of courses and public engagement.

Positions include PhD and postdoctoral posts in philosophy, bioethics, law, history of science and education departments, roles in science communication, public engagement and museums, teaching posts in schools and universities, and posts in research policy, funding agencies and ethics bodies. Related hubs: Neurotechnology and BCI, Clinical and translational, Cognitive, and Neurogenetics and genomics.
